/**
 * M41：预生成协调层 — polishUserTask / generateClarifyQuestions。
 */
import * as fs from 'fs';
import type * as vscode from 'vscode';
import type { BackendMessage } from './WorkflowDefinition';
import { buildTaskPolishSystemPrompt } from './TaskPolishPrompt';
import { REUSE_STRATEGY_OPTIONS } from './ReuseStrategy';
import { extractJsonObject } from './JsonExtract';
import { HOST_INPUT_PAGE_BUSY_TITLES as INPUT_PAGE_BUSY_TITLES } from './WebviewInputGenerationUiHost';
import { resolveExistingDirectoryPath } from './WorkflowPathResolver';
import { pregenMsg } from './l10n/gateMsg';
import { uiMsg } from './l10n/uiStrings';
import {
  ERROR_TYPE_INVARIANT_VIOLATION,
  ERROR_TYPE_LLM_INVALID_OUTPUT,
} from './WorkflowStageErrorHelpers';
import {
  PREGEN_CLARIFY_QUESTIONS_MAX,
  PREGEN_EXPERIENCE_REFS_MAX,
} from './UiListLimits';
import { withSessionFields } from './InstanceSession';
import { TRACE_STAGE_CLARIFY_QUESTIONS, TRACE_STAGE_TASK_POLISH } from './generation/GenerationTraceStageIds';
import {
  GENERATION_OPERATION_POLISH,
} from './generation/GenerationOperationIds';
import type { GenerationOperationId } from './generation/GenerationOperationIds';

export const POLISH_DRAFT_MAX_CHARS = 48_000;
export const POLISH_CACHE_MAX = 32;

export interface PreGenerationHost {
  bindPanel(panel: vscode.WebviewPanel): void;
  postMessage(panel: vscode.WebviewPanel, msg: BackendMessage): void;
  postGenerationProgress(
    panel: vscode.WebviewPanel,
    operation: GenerationOperationId,
    phase: 'preparing' | 'llm' | 'parsing' | 'validating',
    message: string,
    detail?: string,
  ): void;
  ensurePreExecDraftShell(opts: {
    phase: 'polish' | 'clarify' | 'generate';
    userInput?: string;
    taskType: string;
    taskWorkspacePathRaw?: string;
  }): string | undefined;
  polishCacheKey(draft: string, taskType: string): string;
  getPolishCacheHit(cacheKey: string): { text: string; polishedAt: string } | undefined;
  rememberPolishCache(cacheKey: string, text: string, polishedAt: string): void;
  getCurrentInstanceKey(): string | undefined;
  invokeLlmRaw(
    systemPrompt: string,
    userContent: string,
    panel: vscode.WebviewPanel,
    traceStageId: string,
  ): Promise<string>;
  warn(message: string): void;
  degraded(reason: string, context?: Record<string, unknown>): void;
}

export function scanExistingTopLevelFiles(
  taskWorkspacePathRaw: string,
  onDegraded?: (reason: string, context?: Record<string, unknown>) => void,
): string[] {
  const res = resolveExistingDirectoryPath(taskWorkspacePathRaw);
  if (!res.ok) {
    return [];
  }
  try {
    return fs
      .readdirSync(res.abs, { withFileTypes: true })
      .filter((d) => d.isFile() && !d.name.startsWith('.'))
      .map((d) => d.name)
      .slice(0, PREGEN_EXPERIENCE_REFS_MAX);
  } catch (e) {
    // 目录已解析存在却 readdir 失败（权限等）属异常：结构化告警后降级返回空列表，行为不变。
    onDegraded?.('scan_existing_files_failed', {
      path: taskWorkspacePathRaw,
      err: e instanceof Error ? e.message : String(e),
    });
    return [];
  }
}

export async function requestClarifyQuestionsFromLlm(
  host: PreGenerationHost,
  userInput: string,
  taskType: string,
  panel: vscode.WebviewPanel,
): Promise<Array<{ id: string; text: string; options?: string[] }>> {
  const systemPrompt =
    '你是需求澄清助手。基于用户的任务描述，提出最多 3 个最关键的澄清问题，帮助后续更准确地拆解工作流。' +
    '仅输出 JSON：{"questions":[{"id":"q1","text":"…","options":["…"]}]}。' +
    'options 可省略（开放式问答）；不要输出除 JSON 外的任何文字。';
  const userPayload = `taskType: ${taskType}\n\n用户任务：\n${userInput}`;
  const raw = await host.invokeLlmRaw(systemPrompt, userPayload, panel, TRACE_STAGE_CLARIFY_QUESTIONS);
  const obj = extractJsonObject(raw);
  if (!obj || typeof obj !== 'object') {
    return [];
  }
  const arr = (obj as { questions?: unknown }).questions;
  if (!Array.isArray(arr)) {
    return [];
  }
  const out: Array<{ id: string; text: string; options?: string[] }> = [];
  for (let i = 0; i < arr.length; i += 1) {
    const q = arr[i] as { id?: unknown; text?: unknown; options?: unknown };
    const text = typeof q.text === 'string' ? q.text.trim() : '';
    if (!text) {
      continue;
    }
    const options = Array.isArray(q.options)
      ? q.options.filter((o): o is string => typeof o === 'string')
      : undefined;
    out.push({
      id: typeof q.id === 'string' && q.id.trim() ? q.id.trim() : `q_llm_${i + 1}`,
      text,
      options: options && options.length > 0 ? options : undefined,
    });
  }
  return out;
}

export async function handlePolishUserTask(
  host: PreGenerationHost,
  draft: string,
  taskType: string,
  panel: vscode.WebviewPanel,
  taskWorkspacePathRaw?: string,
): Promise<void> {
  host.bindPanel(panel);
  const trimmed = draft.trim().slice(0, POLISH_DRAFT_MAX_CHARS);
  if (!trimmed) {
    host.postMessage(panel, {
      type: 'workflowFailed',
      reason: pregenMsg('emptyDraft'),
      errorType: ERROR_TYPE_INVARIANT_VIOLATION,
    });
    return;
  }
  const cacheKey = host.polishCacheKey(trimmed, taskType);
  const hit = host.getPolishCacheHit(cacheKey);
  if (hit) {
    host.postMessage(panel, {
      type: 'userTaskPolished',
      text: hit.text,
      polishedAt: hit.polishedAt,
      fromCache: true,
      ...withSessionFields(host.getCurrentInstanceKey()),
    });
    return;
  }
  const shellKey = host.ensurePreExecDraftShell({
    phase: 'polish',
    userInput: trimmed,
    taskType,
    taskWorkspacePathRaw,
  });
  try {
    host.postGenerationProgress(
      panel,
      GENERATION_OPERATION_POLISH,
      'llm',
      INPUT_PAGE_BUSY_TITLES.workflowLlm,
      '整理需求草稿…',
    );
    const systemPrompt = buildTaskPolishSystemPrompt(taskType);
    const userPayload = `以下是用户草稿：\n\n${trimmed}`;
    const raw = await host.invokeLlmRaw(systemPrompt, userPayload, panel, TRACE_STAGE_TASK_POLISH);
    const text = raw.trim();
    if (!text) {
      throw new Error(uiMsg('stagent.error.polishEmptyBody'));
    }
    const polishedAt = new Date().toISOString();
    host.rememberPolishCache(cacheKey, text, polishedAt);
    host.postMessage(panel, {
      type: 'userTaskPolished',
      text,
      polishedAt,
      fromCache: false,
      ...withSessionFields(shellKey ?? host.getCurrentInstanceKey()),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    host.postMessage(panel, {
      type: 'workflowFailed',
      reason: msg,
      errorType: ERROR_TYPE_LLM_INVALID_OUTPUT,
    });
  }
}

export async function handleGenerateClarifyQuestions(
  host: PreGenerationHost,
  userInput: string,
  taskType: string,
  taskWorkspacePathRaw: string,
  panel: vscode.WebviewPanel,
): Promise<void> {
  host.bindPanel(panel);
  const emit = (questions: Array<{ id: string; text: string; options?: string[] }>): void => {
    host.postMessage(panel, { type: 'clarifyQuestions', questions });
  };
  host.ensurePreExecDraftShell({
    phase: 'clarify',
    userInput,
    taskType,
    taskWorkspacePathRaw,
  });
  try {
    const existingFiles = scanExistingTopLevelFiles(taskWorkspacePathRaw, (reason, ctx) =>
      host.degraded(reason, ctx),
    );
    const questions: Array<{ id: string; text: string; options?: string[] }> = [];
    if (existingFiles.length > 0) {
      questions.push({
        id: 'q_files',
        text: `工作文件夹中已存在 ${existingFiles.length} 个文件（如 ${existingFiles
          .slice(0, PREGEN_CLARIFY_QUESTIONS_MAX)
          .join('、')}${existingFiles.length > PREGEN_CLARIFY_QUESTIONS_MAX ? ' …' : ''}）。希望如何处理？`,
        options: REUSE_STRATEGY_OPTIONS.map((o) => o.label),
      });
    }
    try {
      const llmQuestions = await requestClarifyQuestionsFromLlm(host, userInput, taskType, panel);
      for (const q of llmQuestions.slice(0, PREGEN_CLARIFY_QUESTIONS_MAX)) {
        questions.push(q);
      }
    } catch (lmErr) {
      host.degraded('clarify_llm_failed', {
        err: lmErr instanceof Error ? lmErr.message : String(lmErr),
      });
    }
    emit(questions);
  } catch (e) {
    host.degraded('clarify_failed', { err: e instanceof Error ? e.message : String(e) });
    emit([]);
  }
}
