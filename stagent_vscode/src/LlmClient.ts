/**
 * LlmClient（M30.1）
 * -----------------
 * 从 `WorkflowEngine` 抽出的 LLM 调用编排：模型选择、流式消费、原始调用、阶段调用。
 *
 * 抽取动机（#1 God Class 第一步）：把 ~230 行与「当前工作流实例状态」无关的 LLM 流式
 * 编排移出引擎，使引擎更聚焦于工作流生命周期编排。
 *
 * 顺带修 #10：`selectPreferredModels` 原先每次调用都重新查询 `vscode.lm.selectChatModels`
 * （DAG 并行时每阶段一次 IPC）。这里按 `preferredModelFamily` 记忆化结果；切换模型族时由
 * `WorkflowEngine.setPreferredModelFamily` 调 `invalidateModelCache()` 失效。只缓存非空解析，
 * 避免把「LM 暂不可用」的空结果固化。
 *
 * 设计：通过 `LlmClientDeps` 注入对引擎的最小依赖（读模型族 / 推送消息 / 会话日志 / 用户行为日志），
 * 不持有 `WorkflowInstance`；阶段模型选择所需的 `stage` 由调用方显式传入。
 */

import * as vscode from 'vscode';
import type { BackendMessage, Stage } from './WorkflowDefinition';
import { looksLikeRefusal } from './WorkflowPrompts';
import { DirectHttpLmModel, STAGENT_DIRECT_HTTP_VENDOR } from './OpenAiCompatibleLlm';
import { uiMsg } from './l10n/uiStrings';
import { getStagentConfiguration } from './settings/getStagentConfiguration';
import { readLlmMaxOutputTokens, readLlmTimeoutMs } from './StagentSettings';
import {
  SESSION_LOG_EVENT_ALL_ATTEMPTS_FAILED,
  SESSION_LOG_EVENT_INPUT_SUMMARY_ERROR,
  SESSION_LOG_EVENT_LLM_END,
  SESSION_LOG_EVENT_LLM_ERROR,
  SESSION_LOG_EVENT_LLM_START,
  SESSION_LOG_EVENT_RESOLVED,
  SESSION_LOG_PURPOSE_LLM_MODEL_SELECT,
} from './SessionLogEvents';
import {
  buildLlmInvokePrompt,
  buildLlmRefusalRetryPrompt,
  createIdleTimeout,
  formatLlmUserFacingError,
  selectChatModelsWithTimeout,
} from './LlmInvokeHelpers';
import { buildAgentSelectionConfig, pickModelForStage } from './AgentSpecializationRouter';
import { DEBUG_EVENT_INPUT_SUMMARY_SKIPPED } from './DebugLogEvents';
import { LOG_PREVIEW_SHORT } from './LogPreviewLimits';
import {
  appendStreamChunk,
  buildLlmStreamSummary,
  emptyStreamStats,
  type StreamStats,
} from './StreamingSummary';

export type LlmModelSelectAttempt = {
  strategy: string;
  family?: string;
  error?: string;
  count?: number;
};

export interface LlmClientDeps {
  /** 当前绑定的模型族（vscode.lm family 或 `direct:<model>`） */
  getPreferredModelFamily: () => string;
  postMessage: (panel: vscode.WebviewPanel | undefined, msg: BackendMessage) => void;
  sessionLog: (stageId: string, event: string, payload?: unknown) => void;
  logUserAction: (kind: string, detail: Record<string, unknown>) => void;
  /** 选型失败等用户可见告警（可选） */
  warn?: (message: string) => void;
  /** per-task debug log（可选；摘要降级等） */
  debugLog?: (stageId: string, event: string, attempt: number, payload?: unknown) => void;
}

export class LlmClient {
  /** #10：按模型族记忆化的模型列表（仅缓存非空结果） */
  private modelCache: { family: string; models: vscode.LanguageModelChat[] } | undefined;

  constructor(private readonly deps: LlmClientDeps) {}

  /** 切换模型族后清缓存（由 WorkflowEngine.setPreferredModelFamily 调用）。 */
  invalidateModelCache(): void {
    this.modelCache = undefined;
  }

  /** #10：优先返回缓存；缓存未命中或模型族变化时重新解析。 */
  async selectPreferredModels(): Promise<vscode.LanguageModelChat[]> {
    const family = this.deps.getPreferredModelFamily();
    if (this.modelCache && this.modelCache.family === family) {
      return this.modelCache.models;
    }
    const models = await this.resolvePreferredModels(family);
    if (models.length > 0) {
      this.modelCache = { family, models };
    }
    return models;
  }

  private async resolvePreferredModels(family: string): Promise<vscode.LanguageModelChat[]> {
    const conf = getStagentConfiguration();
    const apiKey = (conf.get<string>('llmApiKey') ?? '').trim();
    const baseUrl = (conf.get<string>('llmBaseUrl') ?? 'https://api.openai.com/v1').replace(/\/$/, '');
    const defaultModel = (conf.get<string>('llmModel') ?? 'gpt-4o').trim() || 'gpt-4o';
    const attempts: LlmModelSelectAttempt[] = [];

    const logResolved = (models: vscode.LanguageModelChat[], strategy: string): vscode.LanguageModelChat[] => {
      this.deps.sessionLog(SESSION_LOG_PURPOSE_LLM_MODEL_SELECT, SESSION_LOG_EVENT_RESOLVED, {
        family,
        strategy,
        modelFamily: models[0]?.family,
        attemptCount: attempts.length,
      });
      return models;
    };

    if (family?.startsWith('direct:')) {
      if (!apiKey) {
        attempts.push({ strategy: 'direct', family, error: 'missing llmApiKey' });
        this.logModelSelectFailure(family, attempts);
        return [];
      }
      const modelName = family.slice('direct:'.length).trim() || defaultModel;
      attempts.push({ strategy: 'direct', family: modelName, count: 1 });
      return logResolved(
        [
          new DirectHttpLmModel(apiKey, baseUrl, modelName, readLlmMaxOutputTokens(conf)) as vscode.LanguageModelChat,
        ],
        'direct',
      );
    }

    const trimmed = family?.trim();
    if (trimmed) {
      try {
        const picked = await selectChatModelsWithTimeout({ family: trimmed });
        if (picked.length > 0) {
          attempts.push({ strategy: 'preferred-family', family: trimmed, count: picked.length });
          return logResolved(picked, 'preferred-family');
        }
        attempts.push({ strategy: 'preferred-family', family: trimmed, count: 0 });
      } catch (e) {
        attempts.push({
          strategy: 'preferred-family',
          family: trimmed,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    const preferredFamilies = ['gpt-4o', 'claude-3.5-sonnet', 'claude-3.7-sonnet'];
    for (const fam of preferredFamilies) {
      try {
        const models = await selectChatModelsWithTimeout({ family: fam });
        if (models.length > 0) {
          attempts.push({ strategy: 'fallback-family', family: fam, count: models.length });
          return logResolved(models, 'fallback-family');
        }
        attempts.push({ strategy: 'fallback-family', family: fam, count: 0 });
      } catch (e) {
        attempts.push({
          strategy: 'fallback-family',
          family: fam,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    try {
      const any = await selectChatModelsWithTimeout({});
      if (any.length > 0) {
        attempts.push({ strategy: 'any-model', count: any.length });
        return logResolved(any, 'any-model');
      }
      attempts.push({ strategy: 'any-model', count: 0 });
    } catch (e) {
      attempts.push({
        strategy: 'any-model',
        error: e instanceof Error ? e.message : String(e),
      });
    }

    if (apiKey) {
      attempts.push({ strategy: 'direct-fallback', family: defaultModel, count: 1 });
      return logResolved(
        [
          new DirectHttpLmModel(apiKey, baseUrl, defaultModel, readLlmMaxOutputTokens(conf)) as vscode.LanguageModelChat,
        ],
        'direct-fallback',
      );
    }

    this.logModelSelectFailure(family, attempts);
    return [];
  }

  private logModelSelectFailure(family: string, attempts: LlmModelSelectAttempt[]): void {
    this.deps.sessionLog(SESSION_LOG_PURPOSE_LLM_MODEL_SELECT, SESSION_LOG_EVENT_ALL_ATTEMPTS_FAILED, {
      family,
      attempts,
    });
    this.deps.warn?.(
      `LLM model selection failed (family=${family || 'default'}; ${attempts.length} attempt(s)). ` +
        'Configure GitHub Copilot or stagent.llmApiKey. See .session-debug.log.',
    );
  }

  /** 消费 LanguageModelChatResponse.text，推送 streamChunk 并写 llm_stream_summary */
  private async consumeTextStream(
    response: vscode.LanguageModelChatResponse,
    model: vscode.LanguageModelChat,
    panel: vscode.WebviewPanel,
    traceStageId: string,
    retried: boolean,
    onActivity?: () => void,
    promptChars = 0,
  ): Promise<string> {
    let full = '';
    let stats: StreamStats = emptyStreamStats();
    const channel = model.vendor === STAGENT_DIRECT_HTTP_VENDOR ? 'http' : 'lm-api';
    for await (const frag of response.text) {
      onActivity?.();
      full += frag;
      stats = appendStreamChunk(stats, frag, new Date().toISOString());
      this.deps.postMessage(panel, { type: 'streamChunk', stageId: traceStageId, chunk: frag });
    }
    this.deps.logUserAction(
      'llm_stream_summary',
      buildLlmStreamSummary(traceStageId, stats, { retried, channel }),
    );
    const promptEstimate = Math.ceil(promptChars / 4);
    const completionEstimate = Math.ceil(stats.chars / 4);
    const total = promptEstimate + completionEstimate;
    if (panel && total > 0) {
      this.deps.postMessage(panel, {
        type: 'llmUsageUpdate',
        stageId: traceStageId,
        promptTokens: promptEstimate,
        completionTokens: completionEstimate,
        totalTokens: total,
      });
    }
    return full;
  }

  /** Direct HTTP：`maxRequestMs` 为 fetch 总时长上限；Copilot 路径忽略该扩展字段。 */
  private buildLlmRequestModelOptions(onActivity: () => void): vscode.LanguageModelChatRequestOptions {
    return { modelOptions: { onActivity, maxRequestMs: readLlmTimeoutMs() } };
  }

  /**
   * 原始 LLM 调用（润色 / 澄清问题 / 生成工作流 / 续写 / 修复）。
   * @remarks 失败时记录 sessionLog 后向上抛出，由生成流程 / 面板展示处理，勿在此吞掉错误。
   */
  async invokeRaw(
    systemPrompt: string,
    userContent: string,
    panel: vscode.WebviewPanel,
    traceStageId: string,
  ): Promise<string> {
    const conf = getStagentConfiguration();
    const apiKey = conf.get<string>('llmApiKey')?.trim() ?? '';
    if (this.deps.getPreferredModelFamily()?.startsWith('direct:') && !apiKey) {
      throw new Error(uiMsg('stagent.error.llmDirectNoApiKey'));
    }
    const models = await this.selectPreferredModels();
    if (models.length === 0) {
      throw new Error(uiMsg('stagent.error.llmNoModelForGenerate'));
    }
    const model = models[0];
    const prompt = buildLlmInvokePrompt(systemPrompt, userContent);
    this.deps.sessionLog(traceStageId, SESSION_LOG_EVENT_LLM_START, {
      model: model.family,
      promptChars: prompt.length,
    });
    try {
      const full = await this.runLlmTextCompletion({
        traceStageId,
        panel,
        model,
        prompt,
        buildRefusalRetryPrompt: buildLlmRefusalRetryPrompt,
      });
      this.deps.sessionLog(traceStageId, SESSION_LOG_EVENT_LLM_END, {
        model: model.family,
        responseChars: full.length,
        preview: full.slice(0, LOG_PREVIEW_SHORT),
      });
      return full;
    } catch (e) {
      this.deps.sessionLog(traceStageId, SESSION_LOG_EVENT_LLM_ERROR, {
        error: e instanceof Error ? e.message : String(e),
      });
      throw new Error(formatLlmUserFacingError(e, readLlmTimeoutMs()));
    }
  }

  /**
   * 阶段 LLM 执行。
   * @remarks 失败时记录 sessionLog 后向上抛出，由 {@link executeStageStep} 转为 stageError，勿在此吞掉错误。
   */
  async executeStageLlm(
    stageId: string,
    systemPrompt: string,
    userContent: string,
    panel: vscode.WebviewPanel,
    stage?: Stage,
  ): Promise<string> {
    const conf = getStagentConfiguration();
    const apiKey = conf.get<string>('llmApiKey')?.trim() ?? '';
    if (this.deps.getPreferredModelFamily()?.startsWith('direct:') && !apiKey) {
      throw new Error(uiMsg('stagent.error.llmDirectNoApiKey'));
    }
    const models = await this.selectPreferredModels();
    if (models.length === 0) {
      throw new Error(uiMsg('stagent.error.llmNoModelForStage'));
    }
    const overrides = conf.get<Record<string, string>>('agentRoleOverrides') ?? {};
    const agentConfig = buildAgentSelectionConfig(overrides);
    const model =
      stage && models.length > 1
        ? pickModelForStage(stage, agentConfig, models) ?? models[0]
        : models[0];
    const prompt = `系统指令：\n${systemPrompt}\n\n用户输入：\n${userContent}`;
    try {
      return await this.runLlmTextCompletion({
        traceStageId: stageId,
        panel,
        model,
        prompt,
        buildRefusalRetryPrompt: (p) =>
          `${p}\n\n补充要求：请继续完成任务本身；若信息不足，请提出可执行假设并输出结构化内容，禁止仅返回拒绝句。`,
      });
    } catch (e) {
      this.deps.sessionLog(stageId, SESSION_LOG_EVENT_LLM_ERROR, {
        error: e instanceof Error ? e.message : String(e),
      });
      throw new Error(formatLlmUserFacingError(e, readLlmTimeoutMs()));
    }
  }

  private async withLlmIdleCancellation<T>(
    fn: (ctx: {
      cts: vscode.CancellationTokenSource;
      onActivity: () => void;
      modelOptions: vscode.LanguageModelChatRequestOptions;
    }) => Promise<T>,
  ): Promise<T> {
    const idleMs = readLlmTimeoutMs();
    const cts = new vscode.CancellationTokenSource();
    const idle = createIdleTimeout(idleMs, () => cts.cancel());
    const onActivity = (): void => idle.reset();
    const modelOptions = this.buildLlmRequestModelOptions(onActivity);
    try {
      return await fn({ cts, onActivity, modelOptions });
    } finally {
      idle.clear();
      cts.dispose();
    }
  }

  private async readResponseTextPlain(
    response: vscode.LanguageModelChatResponse,
    onActivity: () => void,
  ): Promise<string> {
    let out = '';
    for await (const frag of response.text) {
      onActivity();
      out += frag;
    }
    return out.trim();
  }

  private async runLlmTextCompletion(args: {
    traceStageId: string;
    panel: vscode.WebviewPanel;
    model: vscode.LanguageModelChat;
    prompt: string;
    buildRefusalRetryPrompt?: (prompt: string) => string;
  }): Promise<string> {
    return this.withLlmIdleCancellation(async ({ cts, onActivity, modelOptions }) => {
      const response = await args.model.sendRequest(
        [vscode.LanguageModelChatMessage.User(args.prompt)],
        modelOptions,
        cts.token,
      );
      const full = await this.consumeTextStream(
        response,
        args.model,
        args.panel,
        args.traceStageId,
        false,
        onActivity,
        args.prompt.length,
      );
      if (looksLikeRefusal(full) && args.buildRefusalRetryPrompt) {
        const retryPrompt = args.buildRefusalRetryPrompt(args.prompt);
        const retry = await args.model.sendRequest(
          [vscode.LanguageModelChatMessage.User(retryPrompt)],
          modelOptions,
          cts.token,
        );
        const retried = await this.consumeTextStream(
          retry,
          args.model,
          args.panel,
          args.traceStageId,
          true,
          onActivity,
          retryPrompt.length,
        );
        if (!looksLikeRefusal(retried) && retried.trim().length > 0) {
          return retried;
        }
      }
      return full;
    });
  }

  private logInputSummarySkipped(
    stageId: string,
    reason: 'no_model' | 'empty_response' | 'invoke_error',
    detail?: string,
  ): void {
    this.deps.debugLog?.(stageId, DEBUG_EVENT_INPUT_SUMMARY_SKIPPED, 0, { reason, detail });
    if (reason === 'invoke_error') {
      this.deps.sessionLog(stageId, SESSION_LOG_EVENT_INPUT_SUMMARY_ERROR, {
        reason,
        error: detail,
      });
    } else {
      this.deps.sessionLog(stageId, SESSION_LOG_EVENT_INPUT_SUMMARY_ERROR, { reason, detail });
    }
  }

  /** 输入上下文超长时的摘要压缩（走统一模型选择，不 bypass LlmClient）。 */
  async summarizeText(stageId: string, prompt: string): Promise<string | undefined> {
    try {
      return await this.withLlmIdleCancellation(async ({ cts, onActivity, modelOptions }) => {
        const models = await this.selectPreferredModels();
        if (models.length === 0) {
          this.logInputSummarySkipped(stageId, 'no_model');
          return undefined;
        }
        const response = await models[0].sendRequest(
          [vscode.LanguageModelChatMessage.User(prompt)],
          modelOptions,
          cts.token,
        );
        const trimmed = await this.readResponseTextPlain(response, onActivity);
        if (trimmed.length === 0) {
          this.logInputSummarySkipped(stageId, 'empty_response');
          return undefined;
        }
        return trimmed;
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logInputSummarySkipped(stageId, 'invoke_error', msg);
      return undefined;
    }
  }
}
