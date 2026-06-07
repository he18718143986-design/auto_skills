import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn } from 'child_process';
import type {
  BackendMessage,
  CodeRunnerConfig,
  ErrorType,
  FileReadConfig,
  FrontendMessage,
  InputSource,
  PatchInstruction,
  SkipCondition,
  Stage,
  StageRuntime,
  ToolPathBase,
  WorkflowDefinition,
  WorkflowInstance,
} from './WorkflowDefinition';
import { DEFAULT_TOOL_PATH_BASE } from './WorkflowDefinition';
import { canSwitchActiveInstance } from './ActiveInstanceGuard';
import {
  STAGE_INIT_NPM_WORKSPACE_ID,
  patchNpmDefaultTestScriptAfterInit,
} from './WorkflowDiskBootstrap';
import {
  applyQuestionAfterAnswers,
  blocksDirectApproveForQuestionAfter,
  isPlainApproveAllowedForStage,
  shouldAutoAdvanceAfterAnswers,
  validateRequiredAnswers,
} from './QuestionAfterFlow';
import { evaluateManualRetryLimit } from './ManualRetryLimit';
import {
  allocateContextBudget,
  classifyStageOutputSource,
  DEFAULT_CONTEXT_TOTAL_TOKEN_LIMIT,
  planInputDegradeMode,
  pickEntryIndexToDegrade,
  resolveExplicitContextDegradeMode,
  thresholdsForRole,
  type InputDegradeMode,
  type InputSourceRole,
} from './InputContextPolicy';
import {
  appendGlobalDecisionContextToSystemPrompt,
  buildGlobalDecisionSystemPromptBlock,
  resolveGlobalDecisionInjectMode,
  type GlobalDecisionInjectMode,
} from './GlobalDecisionContext';
import { validateGeneratedWorkflow } from './WorkflowValidation';
import { verifyRule20 } from './Rule20Verify';
import {
  buildGeneratorWarnings,
} from './Rule20RuntimeGate';
import {
  formatRule20ViolationsBlockReason,
  shouldBlockGenerateOnRule20Violations,
} from './GeneratedWorkflowGate';
import { buildPlanSummary, buildStageSourceSummary } from './WorkflowPlanSummary';
import { buildWorkflowProcessDocs } from './WorkflowProcessDocs';
import { buildDeletionTargets, type DeleteScope } from './WorkflowDeletePlan';
import {
  formatWorkflowGeneratedWarningsForDisplay,
  summarizeRule20VerifyForLog,
} from './Rule20WarningDisplay';
import { evaluateDecisionContentLintGate } from './DecisionRecordVerify';
import { buildDebugLogCopyResult } from './DebugLogUtils';
import { normalizeQuestions } from './QuestionNormalization';
import { extractJsonObject, isLikelyTruncatedJson } from './JsonExtract';
import {
  buildWorkflowGeneratorPrompt,
  ensureDecisionPromptStrict,
  looksLikeRefusal,
  safeSnippet,
} from './WorkflowPrompts';
import {
  buildTaskTypeOverrideWarning,
  isAutoTaskType,
  isKnownTaskType,
  resolveGeneratedTaskType,
} from './TaskTypeResolution';
import { buildTaskPolishSystemPrompt } from './TaskPolishPrompt';
import { appendDebugLogLine, formatDebugLogLine, sanitizeForLog } from './WorkflowLogging';
import { appendSessionLogLine, formatSessionLogLine, sessionDebugLogPath } from './SessionDebugLog';
import {
  applyQuestionBeforeAnswers,
  applyRetryBase,
  applyRetryForDecisionCurrent,
  applyRetryForNonDecision,
  collectDecisionRetryResets,
  markApproved,
  markDecisionApproved,
} from './WorkflowStateTransitions';
import {
  getDefaultTaskDir as getDefaultTaskDirFromPersistence,
  instanceDiskStateFileExists,
  persistInstanceFile as persistInstanceFileToDisk,
  readInstanceFile as readInstanceFileFromDisk,
  resolveInstanceTaskDir,
  type InstanceTaskDirHint,
} from './WorkflowPersistence';
import { resolveInstanceLoadSync } from './WorkflowInstancePersistenceSync';
import { buildExecutionRecoveryMessages, resetInterruptedExecutionStages } from './WorkflowRecoveryViewModel';
import {
  buildTaskListItem,
  getRecoverableInstanceKeysFromGlobalStateKeys,
  type TaskListItem,
} from './WorkflowInstanceQuery';
import { executeNextStageLoop } from './WorkflowExecutor';
import { resolveDagMaxParallelism, syncDagCurrentStageIndex } from './WorkflowDag';
import { emitStageDoneAdvancePersist } from './WorkflowEngineContinuation';
import {
  appendGlobalFailureJsonl,
  appendWorkflowFailureJsonl,
  buildWorkflowFailureRecord,
} from './WorkflowFailureLog';
import {
  appendWorkflowExperience,
  buildWorkflowExperience,
  resolveExperienceStorePath,
  WorkflowExperienceStore,
} from './WorkflowExperienceStore';
import {
  readConfidencePauseThreshold,
  readContractNodePauseThreshold,
  readPauseContractNodesEnabled,
  readMemoryExperienceStoreEnabled,
  readMemoryMaxExperienceEntries,
  readCodebaseContextEnabled,
  readCodebaseContextMaxTokens,
  readExperienceInjectOnGenerate,
  readPromptVersionsEnabled,
  readSandboxEnabled,
  readStaticAnalysisEnabled,
  readLlmTimeoutMs,
  readLlmMaxOutputTokens,
  readDebugVerbose,
  readRuntimeRule20VerifyEnabled,
  readDecisionContentLintEnabled,
  readMaxManualStageRetries,
  readInjectApprovedDecisionContext,
  readGlobalDecisionInjectMode,
  readDagMaxParallelism,
  readPlanCompletenessGateEnabled,
} from './StagentSettings';
import { lenientExtractClarifyQuestions } from './ClarifyQuestionsParse';
import { lintPlanCompleteness, formatPlanCompletenessBlockReason } from './PlanCompletenessGate';
import { lintCrossFileKeyContract, type ProjectFile } from './CrossFileKeyContractLint';
import { lintTestQuality, testQualityIssuesToWarnings } from './TestQualityLint';
import { parseGlossary } from './ProjectGlossaryStore';
import { readGlossaryEnabled } from './StagentSettings';
import { collectWorkflowArtifacts } from './WorkflowArtifactRegistry';
import {
  buildLlmInvokePrompt,
  buildLlmRefusalRetryPrompt,
  buildJsonRepairPrompt,
  buildJsonContinuationPrompt,
  formatLlmUserFacingError,
  createIdleTimeout,
} from './LlmInvokeHelpers';
import { buildLlmWaitingDetail, INPUT_PAGE_BUSY_TITLES } from './WebviewInputGenerationUi';
import {
  applySnapshotDegradation,
  buildCodebaseSnapshot,
  estimateTextTokens,
  formatSnapshotForPrompt,
} from './CodebaseContextProvider';
import { buildHITLPolicy } from './AdaptiveHITLPolicy';
import {
  buildAgentSelectionConfig,
  pickModelForStage,
} from './AgentSpecializationRouter';
import {
  buildDependencyGraph,
  dependencyGraphToWarningLines,
  formatDependencyGraphForPrompt,
  resolveSrcDirForWorkspace,
} from './DependencyGraphAnalyzer';
import {
  complexityEstimateToWarningLines,
  estimateWorkflowComplexity,
  formatComplexityBlockForPrompt,
} from './WorkflowComplexityEstimator';
import { buildExperienceFewShotForGenerator } from './ExperienceGeneratorContext';
import { SkillRegistry } from './SkillRegistry';
import { assembleSkillWorkflow, prependGrillStage } from './SkillWorkflowAssembler';
import { SKILL_GRILL_WITH_DOCS } from './ScenarioRouter';
import { isSkillNativeWorkflow } from './SkillToolKinds';
import type { LlmModel, LlmSendOptions, PlatformAdapter } from './platform/PlatformAdapter';
import {
  resolveCodeRunnerTimeoutSeconds,
  resolveSandboxNetworkAllowed,
} from './CodeRunnerInvokeHelpers';
import { mapSandboxError, runInSandbox } from './SandboxExecutor';
import { WorkflowParallelMonitor } from './WorkflowParallelMonitor';
import {
  ArtifactLifecycleManager,
  markArtifactsApprovedForStage,
  markArtifactsVerifiedForStage,
} from './ArtifactLifecycleManager';
import {
  collectStageArtifactHints,
  findStageArtifact,
  resolveStageArtifactAbsPath,
} from './ArtifactUiHints';
import {
  loadManagedPromptSlots,
  resolveDefaultPromptVersionStorePath,
} from './PromptVersionManager';
import {
  analysisResultsToWarningLines,
  buildDefaultWorkspaceChecks,
  runStaticAnalysis,
  suggestVerificationStages,
} from './StaticAnalysisPipeline';
import type { ManagedPromptSlotName } from './WorkflowPrompts';
import {
  appendStreamChunk,
  buildLlmStreamSummary,
  emptyStreamStats,
  type StreamStats,
} from './StreamingSummary';
import {
  hoistStageWriteOutputToToolConfig,
  isRenderableWorkflowForConfirm,
  validateAndPrepareGeneratedWorkflow,
} from './WorkflowEngineHelpers';
import {
  expandUserHomePath,
  getReadableProjectRoots,
  pickZoomOutFilePath,
  resolveExistingDirectoryPath,
  resolveInitialTaskDir,
  resolvePreExecTaskDir,
  resolveWorkspaceRootAbsolute,
  safeJoinUnderWorkspaceRoot,
} from './WorkflowPathResolver';
import {
  estimateTokens,
  primaryOutputKey,
  stageOutputToText,
  toReferenceText,
  truncateStageOutputForInput,
} from './WorkflowInputContent';

const MAX_STAGES_WARN = 45;
const INPUT_TRUNCATE_TOKENS = 3000;
const INPUT_TOTAL_LIMIT_TOKENS = DEFAULT_CONTEXT_TOTAL_TOKEN_LIMIT;
const POLISH_DRAFT_MAX_CHARS = 48_000;
const POLISH_META_DRAFT_MAX = 12_000;
const POLISH_CACHE_MAX = 32;
const PREFERRED_LM_STATE_KEY = 'stagent.preferredLanguageModelFamily';
const FEEDBACK_LAST_ASKED_KEY = 'stagent.feedbackLastAskedAt';

/** 将 q_files 澄清答案映射为 reuseStrategy（移植自 ai-workflow）。 */
function resolveReuseStrategyFromClarify(
  answer: string | undefined,
): 'regenerate' | 'reuse-all' | 'reuse-partial' {
  const a = (answer ?? '').trim();
  if (!a) {
    return 'regenerate';
  }
  if (a.includes('逐个') || a.includes('部分')) {
    return 'reuse-partial';
  }
  if (a.includes('复用') || a.includes('跳过')) {
    return 'reuse-all';
  }
  return 'regenerate';
}

export function evaluateSkipCondition(condition: SkipCondition, runtimes: StageRuntime[]): boolean {
  const ref = runtimes.find((r) => r.stageId === condition.stageId);
  if (!ref) {
    return false;
  }
  const key = condition.outputKey ?? '_exitCode';
  switch (condition.type) {
    case 'exitCodeZero':
      return ref.outputs[key] === 0;
    case 'exitCodeNonZero':
      return typeof ref.outputs[key] === 'number' && ref.outputs[key] !== 0;
    case 'stageSkipped':
      return ref.status === 'skipped';
    case 'stageSkippedOrExitCodeZero':
      return ref.status === 'skipped' || ref.outputs[key] === 0;
    default:
      return false;
  }
}

export { estimateTokens } from './WorkflowInputContent';

export class WorkflowEngine {
  private readonly platform: PlatformAdapter;
  private instance: WorkflowInstance | undefined;
  private currentInstanceKey: string | undefined;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  /** 实例集合变化（持久化 / 删除）时触发，供任务列表侧栏刷新。 */
  private instancesChangedListener: (() => void) | undefined;
  /** 侧栏 / 持久化：vscode.lm family，或 `direct:<model>` 走 OpenAI 兼容 HTTP */
  private preferredModelFamily: string;
  /** 内存缓存：同草稿 + taskType 重复润色时跳过 LLM（扩展重载后清空） */
  private readonly polishCache = new Map<string, { text: string; polishedAt: string }>();
  /** M15.3：同一实例仅写入一次 experiences.jsonl */
  private experiencePersistedForKey?: string;
  /** #5：executeNextStage 嵌套深度；>0 时禁止切换到其他 instanceKey。 */
  private executionDepth = 0;

  private ensureArtifactRegistry(): ArtifactLifecycleManager {
    if (!this.instance) {
      throw new Error('invariant-violation: no active workflow instance');
    }
    if (!this.instance.artifactRegistry) {
      this.instance.artifactRegistry = [];
    }
    return new ArtifactLifecycleManager(this.instance.artifactRegistry);
  }

  private trackPersistedFile(input: {
    stageId: string;
    outputKey: string;
    filePath: string;
    content: string;
    existedBefore: boolean;
    priorContent?: string;
  }): void {
    if (!this.instance) {
      return;
    }
    this.ensureArtifactRegistry().trackPersistedFile(input);
  }

  constructor(platform: PlatformAdapter) {
    this.platform = platform;
    this.preferredModelFamily = this.platform.state.get<string>(PREFERRED_LM_STATE_KEY) ?? '';
  }

  postMessage(msg: BackendMessage): void {
    if (msg.type === 'stageError') {
      try {
        this.debugStageErrorLine(msg);
      } catch (e) {
        this.warn(`stage_error debug log: ${String(e)}`);
      }
      try {
        if (this.instance?.taskDir) {
          const rec = buildWorkflowFailureRecord(this.instance, {
            stageId: msg.stageId,
            error: msg.error,
            errorType: msg.errorType,
          });
          if (rec) {
            appendWorkflowFailureJsonl(this.instance.taskDir, rec, (m) => this.warn(m));
            appendGlobalFailureJsonl(this.platform.paths.globalStorageDir(), rec, (m) => this.warn(m));
          }
        }
      } catch (e) {
        this.warn(`stageError failure-log: ${String(e)}`);
      }
      if (this.instance?.status === 'failed') {
        this.persistWorkflowExperience('failed', {
          stageId: msg.stageId,
          errorType: msg.errorType,
        });
      }
      // === M14.3 I-22：stageError 也作为 user_action 一条 ===
      // 历史上 stageError 走独立通道（debug 行 + failures.jsonl），与 user_action 流分离，
      // 导致从 .wf-debug.log 单文件无法连续看到 “发生何事 → 引擎反应” 的完整时间线。
      try {
        this.logUserAction('stage_error', {
          stageId: msg.stageId,
          errorType: msg.errorType,
          errorPreview:
            typeof msg.error === 'string' && msg.error.length > 200
              ? `${msg.error.slice(0, 200)}…(+${msg.error.length - 200})`
              : msg.error,
        });
      } catch (e) {
        this.warn(`stage_error user_action: ${String(e)}`);
      }
    }
    if (msg.type === 'workflowCompleted') {
      this.persistWorkflowExperience('completed');
      this.maybePromptFeedback();
    }
    this.platform.ui.send(msg);
    if (
      msg.type === 'stageStatusUpdate' &&
      msg.status === 'paused' &&
      !msg.isDecisionStage &&
      this.instance
    ) {
      this.markStageArtifactsVerified(msg.stageId);
      this.emitStageArtifactHints(msg.stageId);
    }
  }

  private postGenerationProgress(
    operation: 'workflow' | 'polish' | 'clarify',
    phase: 'preparing' | 'llm' | 'parsing' | 'validating',
    message: string,
    detail?: string,
  ): void {
    this.postMessage({ type: 'generationProgress', operation, phase, message, detail });
  }

  private markStageArtifactsVerified(stageId: string): void {
    if (!this.instance?.artifactRegistry) {
      return;
    }
    markArtifactsVerifiedForStage(this.instance.artifactRegistry, stageId);
  }

  private markStageArtifactsApproved(stageId: string): void {
    if (!this.instance?.artifactRegistry) {
      return;
    }
    markArtifactsApprovedForStage(this.instance.artifactRegistry, stageId);
  }

  private emitStageArtifactHints(stageId: string): void {
    if (!this.instance) {
      return;
    }
    const stage = this.instance.definition.stages.find((s) => s.id === stageId);
    if (!stage || stage.isDecisionStage) {
      return;
    }
    const artifacts = collectStageArtifactHints(this.instance.artifactRegistry, stage);
    if (artifacts.length === 0) {
      return;
    }
    this.platform.ui.send({ type: 'stageArtifactHints', stageId, artifacts });
  }

  private warn(message: string): void {
    console.warn(`[Stagent] ${message}`);
  }

  /**
   * 工作流完成后引导用户填写反馈（移植自 ai-workflow）。
   * — 表单 URL 与冷却天数读自配置；URL 为空时静默跳过；冷却期内不重复打扰。
   */
  private maybePromptFeedback(): void {
    try {
      const formUrl = this.platform.config.get<string>('feedback.formUrl', '').trim();
      if (!formUrl) {
        return;
      }
      const cooldownDays = Math.max(0, this.platform.config.get<number>('feedback.cooldownDays', 7));
      const lastAsked = this.platform.state.get<string>(FEEDBACK_LAST_ASKED_KEY);
      if (lastAsked) {
        const elapsedDays = (Date.now() - new Date(lastAsked).getTime()) / 86_400_000;
        if (Number.isFinite(elapsedDays) && elapsedDays < cooldownDays) {
          return;
        }
      }
      this.platform.state.set(FEEDBACK_LAST_ASKED_KEY, new Date().toISOString());
      void this.platform.notify
        .info('Stagent：工作流已完成，欢迎花 1 分钟反馈使用体验，帮助我们改进。', '填写反馈')
        .then((choice) => {
          if (choice === '填写反馈') {
            void this.platform.shell.openExternal(formUrl);
          }
        });
    } catch (e) {
      this.warn(`feedback_prompt_failed: ${String(e)}`);
    }
  }

  /** M15.3：工作流终态写入 `.stagent/experiences.jsonl`（不存 userInput 原文） */
  private persistWorkflowExperience(
    completionStatus: 'completed' | 'failed',
    failure?: { stageId: string; errorType: ErrorType },
  ): void {
    if (!this.instance) {
      return;
    }
    const instanceKey = this.currentInstanceKey;
    if (!instanceKey || this.experiencePersistedForKey === instanceKey) {
      return;
    }

    const cfg = this.platform.config;
    if (!readMemoryExperienceStoreEnabled(cfg)) {
      return;
    }

    const workspaceRoot = this.instance.definition.meta.taskWorkspacePath?.trim();
    if (!workspaceRoot) {
      return;
    }

    const maxEntries = readMemoryMaxExperienceEntries(cfg);
    const experience = buildWorkflowExperience(this.instance, {
      completionStatus,
      instanceKey,
      failureStageId: failure?.stageId,
      failureErrorType: failure?.errorType,
    });
    appendWorkflowExperience(
      resolveExperienceStorePath(workspaceRoot),
      experience,
      maxEntries,
      (m) => this.warn(m),
    );
    this.experiencePersistedForKey = instanceKey;
  }

  private error(message: string): void {
    console.error(`[Stagent] ${message}`);
  }

  private appendDebugLine(line: string): void {
    if (!this.instance || !this.currentInstanceKey) {
      return;
    }
    try {
      const dir = this.ensureTaskDir(this.currentInstanceKey);
      appendDebugLogLine(dir, line);
    } catch (e) {
      this.warn(`debug_log_append_failed err=${String(e)}`);
    }
  }

  private debugLog(stageId: string, event: string, attempt: number, payload?: unknown): void {
    const traceId = this.instance?.traceId ?? 'trace-missing';
    const line = formatDebugLogLine(traceId, stageId, event, attempt, sanitizeForLog(payload));
    this.appendDebugLine(line);
  }

  /**
   * LLM 追溯日志：有预执行/执行实例时写入 taskDir/.wf-debug.log；无实例时 fallback 到
   * globalStorageDir/.session-debug.log。best-effort，失败仅 warn。
   */
  private llmTraceLog(traceStageId: string, event: string, payload?: unknown): void {
    if (this.instance && this.currentInstanceKey) {
      this.debugLog(traceStageId, event, 0, payload);
    } else {
      this.sessionLog(traceStageId, event, payload);
    }
  }

  /** 无实例时的会话级 fallback 日志（globalStorageDir/.session-debug.log）。 */
  private sessionLog(purpose: string, event: string, payload?: unknown): void {
    try {
      const dir = this.platform.paths.globalStorageDir();
      appendSessionLogLine(dir, formatSessionLogLine(purpose, event, payload));
    } catch (e) {
      this.warn(`session_log_append_failed err=${String(e)}`);
    }
  }

  private isDebugVerbose(): boolean {
    return readDebugVerbose(this.platform.config);
  }

  /** v2.8.1：默认开启；显式 `false` 回滚至 v2.7（不跑 verifyRule20） */
  private isRuntimeRule20VerifyEnabled(): boolean {
    return readRuntimeRule20VerifyEnabled(this.platform.config);
  }

  /** M20.2.2：默认开启；workflow globalConfig 或 vscode 显式 false 可关闭 */
  private isDecisionContentLintVscodeDefault(): boolean {
    return readDecisionContentLintEnabled(this.platform.config);
  }

  /** `stagent.maxManualStageRetries`；与 package.json 默认 3 / minimum 1 一致 */
  private getMaxManualStageRetries(): number {
    return readMaxManualStageRetries(this.platform.config);
  }

  /** vscode `stagent.injectApprovedDecisionContext`；默认 true */
  private getInjectApprovedDecisionContextVscodeDefault(): boolean {
    return readInjectApprovedDecisionContext(this.platform.config);
  }

  private getGlobalDecisionInjectModeVscodeDefault(): GlobalDecisionInjectMode {
    return readGlobalDecisionInjectMode(this.platform.config);
  }

  private getDagMaxParallelismVscodeDefault(): number {
    return readDagMaxParallelism(this.platform.config);
  }

  private resolveDagMaxParallelismForInstance(): number {
    if (!this.instance) {
      return 1;
    }
    return resolveDagMaxParallelism(
      this.instance.definition.globalConfig?.dagMaxParallelism,
      this.getDagMaxParallelismVscodeDefault(),
    );
  }

  private augmentSystemPromptWithGlobalDecisions(
    stage: Stage,
    runtime: StageRuntime,
    systemPrompt: string,
  ): string {
    if (!this.instance) {
      return systemPrompt;
    }
    const block = buildGlobalDecisionSystemPromptBlock(
      this.instance.definition,
      this.instance.stageRuntimes,
      stage,
      {
        workflowInjectFlag: this.instance.definition.globalConfig?.injectApprovedDecisionContext,
        vscodeInjectEnabled: this.getInjectApprovedDecisionContextVscodeDefault(),
        mode: resolveGlobalDecisionInjectMode(
          this.instance.definition.globalConfig?.globalDecisionInjectMode,
          this.getGlobalDecisionInjectModeVscodeDefault(),
        ),
      },
    );
    if (block) {
      const mode = resolveGlobalDecisionInjectMode(
        this.instance.definition.globalConfig?.globalDecisionInjectMode,
        this.getGlobalDecisionInjectModeVscodeDefault(),
      );
      this.debugLog(stage.id, 'global_decision_context_inject', runtime.retryCount + 1, {
        target: 'systemPrompt',
        mode,
        chars: block.length,
      });
    }
    return appendGlobalDecisionContextToSystemPrompt(systemPrompt, block);
  }

  private logUserAction(kind: string, detail: Record<string, unknown>): void {
    const stageId = typeof detail.stageId === 'string' ? detail.stageId : 'workflow';
    this.debugLog(stageId, 'user_action', 0, { kind, ...detail });
  }

  private debugStageErrorLine(msg: Extract<BackendMessage, { type: 'stageError' }>): void {
    const err = msg.error;
    const preview = err.length > 400 ? `${err.slice(0, 400)}…` : err;
    this.debugLog(msg.stageId, 'stage_error', 0, {
      errorType: msg.errorType,
      errorPreview: preview,
      hasRawOutput: Boolean(msg.rawOutput),
      hasStdout: Boolean(msg.stdout),
      hasStderr: Boolean(msg.stderr),
    });
  }

  private scheduleSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
      this.saveTimer = undefined;
      this.flushSave();
    }, 200);
  }

  private flushSave(): void {
    if (!this.instance || !this.currentInstanceKey) {
      return;
    }
    this.persistInstanceSnapshot(this.currentInstanceKey, this.instance);
  }

  /** 立即写盘指定实例快照（切换活跃实例前 flush 旧实例）。 */
  private persistInstanceSnapshot(key: string, inst: WorkflowInstance): void {
    this.platform.state.set(`wf_instance_${key}`, inst);
    this.persistInstanceFile(key, inst);
    this.notifyInstancesChanged();
  }

  /** #5：切换活跃实例；执行中禁止跨实例切换，切换前 flush 旧实例。 */
  private tryActivateInstance(
    targetKey: string,
    loaded: WorkflowInstance,
  ): { ok: true } | { ok: false; reason: string } {
    const decision = canSwitchActiveInstance({
      currentKey: this.currentInstanceKey,
      targetKey,
      executionDepth: this.executionDepth,
    });
    if (!decision.ok) {
      this.postMessage({
        type: 'instanceSwitchBlocked',
        reason: decision.reason,
        targetInstanceKey: targetKey,
        activeInstanceKey: this.currentInstanceKey,
      });
      return { ok: false, reason: decision.reason };
    }
    if (this.currentInstanceKey && this.currentInstanceKey !== targetKey && this.instance) {
      if (this.saveTimer) {
        clearTimeout(this.saveTimer);
        this.saveTimer = undefined;
      }
      this.persistInstanceSnapshot(this.currentInstanceKey, this.instance);
    }
    if (this.currentInstanceKey !== targetKey) {
      this.experiencePersistedForKey = undefined;
    }
    this.instance = loaded;
    this.currentInstanceKey = targetKey;
    return { ok: true };
  }

  getActiveInstanceKey(): string | undefined {
    return this.currentInstanceKey;
  }

  isExecutionInFlight(): boolean {
    return this.executionDepth > 0;
  }

  private beginExecutionDepth(): void {
    this.executionDepth++;
  }

  private endExecutionDepth(): void {
    this.executionDepth = Math.max(0, this.executionDepth - 1);
  }

  /** 注册实例集合变化监听（任务列表侧栏用）。 */
  setInstancesChangedListener(listener: (() => void) | undefined): void {
    this.instancesChangedListener = listener;
  }

  private notifyInstancesChanged(): void {
    try {
      this.instancesChangedListener?.();
    } catch (e) {
      this.warn(`instances_changed_listener_failed: ${String(e)}`);
    }
  }

  /**
   * 确认页持久化：生成工作流后落盘一个 `idle` 草稿实例，使任务从生成阶段即在侧栏可见、
   * 可恢复（重启回到确认页）、放弃时可删。返回草稿实例 key（解析 taskDir 失败则返回 undefined，
   * 不阻断生成）。重新生成时若当前活跃实例仍是未启动的 idle 草稿，先清理避免堆积。
   */
  private persistDraftInstance(wf: WorkflowDefinition): string | undefined {
    if (this.currentInstanceKey && this.instance?.status === 'idle') {
      this.deleteInstance(this.currentInstanceKey);
    }
    const instanceId = crypto.randomUUID();
    const taskDirRes = this.resolveInitialTaskDirForStart(instanceId, wf);
    if (!taskDirRes.ok) {
      this.warn(`persist_draft_instance_resolve_dir_failed reason=${taskDirRes.reason}`);
      return undefined;
    }
    this.currentInstanceKey = instanceId;
    this.instance = {
      traceId: `trace_${crypto.randomUUID()}`,
      definition: wf,
      currentStageIndex: 0,
      stageRuntimes: wf.stages.map((s) => ({
        stageId: s.id,
        status: 'pending',
        outputs: {},
        retryCount: 0,
      })),
      status: 'idle',
      taskDir: taskDirRes.dir,
    };
    this.experiencePersistedForKey = undefined;
    this.flushSave();
    return instanceId;
  }

  /**
   * 方案 A：润色/澄清/生成入口即建 idle 预执行壳（stages 为空），使全程 LLM 与 debug 事件
   * 写入同一 taskDir/.wf-debug.log。幂等复用当前 idle 空壳；完整 idle 草稿则先删再建。
   */
  private ensurePreExecDraftShell(opts: {
    phase: 'polish' | 'clarify' | 'generate';
    userInput?: string;
    taskType: string;
    taskWorkspacePathRaw?: string;
  }): string | undefined {
    const { phase, userInput, taskType, taskWorkspacePathRaw } = opts;

    if (
      this.currentInstanceKey &&
      this.instance?.status === 'idle' &&
      this.instance.definition.stages.length === 0
    ) {
      const meta = this.instance.definition.meta ?? {};
      const wsAbs = taskWorkspacePathRaw?.trim()
        ? (() => {
            const res = this.resolveExistingDirectoryPath(taskWorkspacePathRaw.trim());
            return res.ok ? res.abs : undefined;
          })()
        : undefined;
      this.instance.definition.meta = {
        ...meta,
        ...(userInput?.trim() ? { userInput: userInput.trim() } : {}),
        taskType,
        ...(wsAbs ? { taskWorkspacePath: wsAbs } : {}),
      };
      if (taskWorkspacePathRaw?.trim()) {
        this.rebindTaskDirIfNeeded(taskWorkspacePathRaw.trim());
      }
      this.flushSave();
      return this.currentInstanceKey;
    }

    if (
      this.currentInstanceKey &&
      this.instance?.status === 'idle' &&
      this.instance.definition.stages.length > 0
    ) {
      this.deleteInstance(this.currentInstanceKey);
    }

    const instanceId = crypto.randomUUID();
    const taskWorkspaceAbs = taskWorkspacePathRaw?.trim()
      ? (() => {
          const res = this.resolveExistingDirectoryPath(taskWorkspacePathRaw.trim());
          return res.ok ? res.abs : undefined;
        })()
      : undefined;

    const placeholderWf = {
      id: `pre-exec-${instanceId.slice(0, 8)}`,
      version: '2.0',
      meta: {
        title: userInput?.trim().slice(0, 80) || '预执行草稿',
        userInput: userInput?.trim() ?? '',
        taskType,
        createdAt: new Date().toISOString(),
        ...(taskWorkspaceAbs ? { taskWorkspacePath: taskWorkspaceAbs } : {}),
      },
      stages: [],
    } as WorkflowDefinition;

    const dirRes = resolvePreExecTaskDir(
      instanceId,
      taskWorkspacePathRaw,
      this.platform.paths.workspaceRoot(),
      this.platform.paths.globalStorageDir(),
    );
    if (!dirRes.ok) {
      this.warn(`pre_exec_shell_resolve_dir_failed reason=${dirRes.reason}`);
      return undefined;
    }

    this.currentInstanceKey = instanceId;
    this.instance = {
      traceId: `trace_${crypto.randomUUID()}`,
      definition: placeholderWf,
      currentStageIndex: 0,
      stageRuntimes: [],
      status: 'idle',
      taskDir: dirRes.dir,
    };
    this.experiencePersistedForKey = undefined;
    fs.mkdirSync(dirRes.dir, { recursive: true });
    this.flushSave();
    this.debugLog('workflow', 'pre_exec_shell_created', 0, { phase, taskDir: dirRes.dir });
    return instanceId;
  }

  /** 润色时 taskDir 在 globalStorage，后续填写工作区后迁移到 `<ws>/.stagent/instances/<key>`。 */
  private rebindTaskDirIfNeeded(taskWorkspacePathRaw: string): void {
    if (!this.instance || !this.currentInstanceKey) {
      return;
    }
    const wsRes = this.resolveExistingDirectoryPath(taskWorkspacePathRaw);
    if (!wsRes.ok) {
      return;
    }
    const targetDir = path.join(wsRes.abs, '.stagent', 'instances', this.currentInstanceKey);
    const currentDir =
      this.instance.taskDir ?? this.getDefaultTaskDir(this.currentInstanceKey);
    if (path.resolve(currentDir) === path.resolve(targetDir)) {
      this.instance.definition.meta = {
        ...this.instance.definition.meta,
        taskWorkspacePath: wsRes.abs,
      };
      return;
    }

    fs.mkdirSync(targetDir, { recursive: true });
    const oldLog = path.join(currentDir, '.wf-debug.log');
    const newLog = path.join(targetDir, '.wf-debug.log');
    if (fs.existsSync(oldLog)) {
      fs.appendFileSync(newLog, fs.readFileSync(oldLog, 'utf-8'), 'utf-8');
    }

    this.instance.taskDir = targetDir;
    this.instance.definition.meta = {
      ...this.instance.definition.meta,
      taskWorkspacePath: wsRes.abs,
    };
    this.flushSave();
    this.debugLog('workflow', 'task_dir_rebound', 0, { from: currentDir, to: targetDir });

    try {
      if (/[\\/]\.stagent[\\/]instances[\\/]|[\\/]instances[\\/]/.test(currentDir)) {
        fs.rmSync(currentDir, { recursive: true, force: true });
      }
    } catch (e) {
      this.warn(`task_dir_rebound_rm_old_failed err=${String(e)}`);
    }
  }

  /**
   * 生成成功：在已有预执行壳上原地更新 definition（保留 traceId / instanceKey / 调试日志）；
   * 无壳时回退 persistDraftInstance。
   */
  private finalizeDraftDefinition(wf: WorkflowDefinition): string | undefined {
    const isPreExecShell =
      this.currentInstanceKey &&
      this.instance?.status === 'idle' &&
      this.instance.definition.stages.length === 0;

    if (isPreExecShell) {
      const key = this.currentInstanceKey!;
      const traceId = this.instance!.traceId;
      const priorTaskDir = this.instance!.taskDir;
      if (wf.meta?.taskWorkspacePath?.trim()) {
        this.rebindTaskDirIfNeeded(wf.meta.taskWorkspacePath);
      }
      this.instance = {
        traceId,
        definition: wf,
        currentStageIndex: 0,
        stageRuntimes: wf.stages.map((s) => ({
          stageId: s.id,
          status: 'pending',
          outputs: {},
          retryCount: 0,
        })),
        status: 'idle',
        taskDir: this.instance!.taskDir ?? priorTaskDir,
      };
      this.experiencePersistedForKey = undefined;
      this.flushSave();
      return key;
    }

    return this.persistDraftInstance(wf);
  }

  private getDefaultTaskDir(instanceId: string): string {
    const ws = this.platform.paths.workspaceRoot();
    return getDefaultTaskDirFromPersistence(instanceId, ws, this.platform.paths.globalStorageDir());
  }

  private expandUserHomePath(raw: string): string {
    return expandUserHomePath(raw);
  }

  /** 校验用户输入的工作区根路径：存在且为目录，返回绝对路径。 */
  private resolveExistingDirectoryPath(
    raw: string,
  ): { ok: true; abs: string } | { ok: false; reason: string } {
    return resolveExistingDirectoryPath(raw);
  }

  /** 新实例 `taskDir`：`meta.taskWorkspacePath` → `\<根>/.stagent/instances/<id>`；否则需已打开工作区。 */
  private resolveInitialTaskDirForStart(
    instanceId: string,
    wf: WorkflowDefinition,
  ): { ok: true; dir: string } | { ok: false; reason: string } {
    const ws = this.platform.paths.workspaceRoot();
    return resolveInitialTaskDir(instanceId, wf, ws, this.platform.paths.globalStorageDir());
  }

  private polishCacheKey(draft: string, taskType: string): string {
    return crypto.createHash('sha256').update(`${taskType}\n${draft}`, 'utf8').digest('hex');
  }

  private rememberPolishCache(cacheKey: string, text: string, polishedAt: string): void {
    if (this.polishCache.size >= POLISH_CACHE_MAX) {
      const first = this.polishCache.keys().next().value as string | undefined;
      if (first) {
        this.polishCache.delete(first);
      }
    }
    this.polishCache.set(cacheKey, { text, polishedAt });
  }

  private getStateFilePath(instanceKey: string, taskDir?: string): string {
    const dir = taskDir ?? this.getDefaultTaskDir(instanceKey);
    return path.join(dir, '.wf-state.json');
  }

  private persistInstanceFile(instanceKey: string, instance: WorkflowInstance): void {
    try {
      const ws = this.platform.paths.workspaceRoot();
      persistInstanceFileToDisk(instanceKey, instance, ws, this.platform.paths.globalStorageDir());
    } catch (e) {
      this.warn(`state_file_persist_failed key=${instanceKey} err=${String(e)}`);
    }
  }

  private readInstanceFile(instanceKey: string, taskDir?: string): WorkflowInstance | undefined {
    try {
      const ws = this.platform.paths.workspaceRoot();
      return readInstanceFileFromDisk(instanceKey, ws, this.platform.paths.globalStorageDir(), taskDir);
    } catch (e) {
      this.warn(`state_file_read_failed key=${instanceKey} err=${String(e)}`);
      return undefined;
    }
  }

  private instanceTaskDirHint(inst?: WorkflowInstance): InstanceTaskDirHint | undefined {
    if (!inst) {
      return undefined;
    }
    return {
      taskDir: inst.taskDir,
      taskWorkspacePath: inst.definition?.meta?.taskWorkspacePath,
    };
  }

  private workspaceFolderPath(): string | undefined {
    return this.platform.paths.workspaceRoot();
  }

  private isInstanceDiskStatePresent(instanceKey: string, hint?: InstanceTaskDirHint): boolean {
    return instanceDiskStateFileExists(
      instanceKey,
      hint,
      this.workspaceFolderPath(),
      this.platform.paths.globalStorageDir(),
    );
  }

  private purgeInstanceGlobalState(instanceKey: string, reason: string): void {
    this.platform.state.set(`wf_instance_${instanceKey}`, undefined);
    this.warn(`instance_purged_global_state key=${instanceKey} reason=${reason}`);
    this.notifyInstancesChanged();
    if (this.currentInstanceKey === instanceKey) {
      this.instance = undefined;
      this.currentInstanceKey = undefined;
      this.saveTimer = undefined;
    }
  }

  /** 激活时扫描：磁盘状态已删则清除 globalState，避免「恢复最近任务」重建目录。 */
  pruneStaleGlobalInstances(): void {
    for (const key of this.platform.state.keys()) {
      if (!key.startsWith('wf_instance_')) {
        continue;
      }
      const instanceKey = key.slice('wf_instance_'.length);
      this.loadInstanceByKey(instanceKey);
    }
  }

  private loadInstanceByKey(instanceKey: string): WorkflowInstance | undefined {
    const gs = this.platform.state.get<WorkflowInstance>(`wf_instance_${instanceKey}`);
    const hint = this.instanceTaskDirHint(gs);
    const diskStateFileExists = this.isInstanceDiskStatePresent(instanceKey, hint);
    const file = diskStateFileExists ? this.readInstanceFile(instanceKey, gs?.taskDir) : undefined;
    const outcome = resolveInstanceLoadSync({
      globalStateInstance: gs,
      diskInstance: file,
      diskStateFileExists,
    });

    if (outcome.kind === 'purge_global') {
      this.purgeInstanceGlobalState(instanceKey, outcome.reason);
      return undefined;
    }
    if (outcome.kind === 'absent') {
      return undefined;
    }
    if (outcome.promoteToGlobalState) {
      this.platform.state.set(`wf_instance_${instanceKey}`, outcome.instance);
    }
    return outcome.instance;
  }

  getRecoverableInstanceKeys(): string[] {
    return getRecoverableInstanceKeysFromGlobalStateKeys(this.platform.state.keys(), (instanceKey) =>
      this.loadInstanceByKey(instanceKey),
    );
  }

  async resumeInstance(instanceKey: string): Promise<{ ok: boolean; error?: string }> {
    const loaded = this.loadInstanceByKey(instanceKey);
    if (!loaded) {
      return { ok: false, error: 'instance-not-found' };
    }
    const activated = this.tryActivateInstance(instanceKey, loaded);
    if (!activated.ok) {
      return { ok: false, error: activated.reason };
    }
    if (!this.instance!.traceId) {
      this.instance!.traceId = `trace_${crypto.randomUUID()}`;
    }
    if (!this.instance!.taskDir) {
      this.instance!.taskDir = this.getDefaultTaskDir(instanceKey);
    }
    syncDagCurrentStageIndex(this.instance!);
    this.debugLog('workflow', 'run_resume', 0, {
      workflowId: this.instance!.definition.id,
      status: this.instance!.status,
    });

    // idle 草稿：仅回到确认页（不重放各阶段状态，否则 reducer 的 stageStatusUpdate 会把
    // UI 误切到 execution）。带上 instanceKey 供「开始执行」复用、放弃时删除。
    if (this.instance!.status === 'idle') {
      const warnings = ['restored_from_persistence'];
      this.postMessage({
        type: 'workflowGenerated',
        workflow: this.instance!.definition,
        warnings,
        warningsDisplay: formatWorkflowGeneratedWarningsForDisplay(warnings),
        instanceKey,
      });
      this.scheduleSave();
      return { ok: true };
    }

    for (const msg of buildExecutionRecoveryMessages(this.instance!, instanceKey)) {
      this.postMessage(msg);
    }

    if (this.instance!.status === 'running') {
      const resetIndices = resetInterruptedExecutionStages(this.instance!);
      if (resetIndices.length > 0) {
        const dag = this.instance!.definition.globalConfig?.enableDagScheduler === true;
        await this.platform.notify.warn(
          dag
            ? 'Stagent：上次 DAG 执行被中断，已重置未完成阶段并继续调度。'
            : 'Stagent：上次执行被中断，将从中断阶段重新执行。',
        );
      }
      await this.executeNextStage();
    }

    this.scheduleSave();
    return { ok: true };
  }

  getTaskSummaries(): WorkflowInstance[] {
    const list: WorkflowInstance[] = [];
    for (const key of this.platform.state.keys()) {
      if (!key.startsWith('wf_instance_')) {
        continue;
      }
      const instanceKey = key.slice('wf_instance_'.length);
      const inst = this.loadInstanceByKey(instanceKey);
      if (inst) {
        list.push(inst);
      }
    }
    return list;
  }

  /** 侧栏任务列表用：轻量项（含 globalState 实例键，供恢复/删除）。 */
  getTaskListItems(): TaskListItem[] {
    const list: TaskListItem[] = [];
    for (const key of this.platform.state.keys()) {
      if (!key.startsWith('wf_instance_')) {
        continue;
      }
      const instanceKey = key.slice('wf_instance_'.length);
      const inst = this.loadInstanceByKey(instanceKey);
      if (inst) {
        list.push(buildTaskListItem(instanceKey, inst));
      }
    }
    return list;
  }

  /**
   * 删除任务，按力度三档：
   * - `record`（默认）：仅清除 globalState 记录 + 实例状态目录
   *   （`<工作文件夹>/.stagent/instances/<id>` 或 globalStorage/instances/<id>）。
   * - `artifacts`：record + 删该任务「新建」的产物与两份过程文档（不碰用户原有/手改文件）。
   * - `folder`：record + 递归删除整个 taskWorkspacePath（受 buildDeletionTargets 护栏约束）。
   */
  deleteInstance(instanceKey: string, scope: DeleteScope = 'record'): void {
    // 取磁盘真源实例（含 artifactRegistry / meta.taskWorkspacePath / taskDir），供产物删除依据。
    const inst =
      this.loadInstanceByKey(instanceKey) ??
      this.platform.state.get<WorkflowInstance>(`wf_instance_${instanceKey}`);

    if (scope !== 'record') {
      const targets = buildDeletionTargets(inst, scope, { homeDir: os.homedir() });
      for (const r of targets.rejected) {
        this.warn(`delete_instance_target_rejected key=${instanceKey} reason=${r.reason} path=${r.path}`);
      }
      for (const f of targets.files) {
        try {
          fs.rmSync(f, { force: true });
        } catch (e) {
          this.warn(`delete_instance_artifact_rm_failed key=${instanceKey} path=${f} err=${String(e)}`);
        }
      }
      for (const d of targets.dirs) {
        try {
          fs.rmSync(d, { recursive: true, force: true });
        } catch (e) {
          this.warn(`delete_instance_folder_rm_failed key=${instanceKey} path=${d} err=${String(e)}`);
        }
      }
    }

    let stateDir: string | undefined;
    try {
      stateDir = resolveInstanceTaskDir(
        instanceKey,
        this.instanceTaskDirHint(inst),
        this.workspaceFolderPath(),
        this.platform.paths.globalStorageDir(),
      );
    } catch (e) {
      this.warn(`delete_instance_resolve_dir_failed key=${instanceKey} err=${String(e)}`);
    }
    this.purgeInstanceGlobalState(instanceKey, 'user_delete');
    if (stateDir && /[\\/]\.stagent[\\/]instances[\\/]|[\\/]instances[\\/]/.test(stateDir)) {
      try {
        fs.rmSync(stateDir, { recursive: true, force: true });
      } catch (e) {
        this.warn(`delete_instance_rm_failed key=${instanceKey} err=${String(e)}`);
      }
    }
  }

  async polishUserTask(
    draft: string,
    taskType: string,
    taskWorkspacePathRaw?: string,
  ): Promise<void> {
    const trimmed = draft.trim().slice(0, POLISH_DRAFT_MAX_CHARS);
    if (!trimmed) {
      this.postMessage({
        type: 'workflowFailed',
        reason: '请先粘贴或填写需求草稿，再点击「需求润色」。',
        errorType: 'invariant-violation',
      });
      return;
    }
    const cacheKey = this.polishCacheKey(trimmed, taskType);
    const hit = this.polishCache.get(cacheKey);
    if (hit) {
      this.postMessage({
        type: 'userTaskPolished',
        text: hit.text,
        polishedAt: hit.polishedAt,
        fromCache: true,
        instanceKey: this.currentInstanceKey,
      });
      return;
    }
    const shellKey = this.ensurePreExecDraftShell({
      phase: 'polish',
      userInput: trimmed,
      taskType,
      taskWorkspacePathRaw,
    });
    try {
      this.postGenerationProgress(
        'polish',
        'llm',
        INPUT_PAGE_BUSY_TITLES.workflowLlm,
        '整理需求草稿…',
      );
      const systemPrompt = buildTaskPolishSystemPrompt(taskType);
      const userPayload = `以下是用户草稿：\n\n${trimmed}`;
      const raw = await this.invokeLlmRaw(systemPrompt, userPayload, 'task-polish');
      const text = raw.trim();
      if (!text) {
        throw new Error('模型未返回有效润色正文。');
      }
      const polishedAt = new Date().toISOString();
      this.rememberPolishCache(cacheKey, text, polishedAt);
      this.postMessage({
        type: 'userTaskPolished',
        text,
        polishedAt,
        fromCache: false,
        instanceKey: shellKey ?? this.currentInstanceKey,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.postMessage({
        type: 'workflowFailed',
        reason: msg,
        errorType: 'llm-invalid-output',
      });
    }
  }

  /**
   * 生成前澄清（移植自 ai-workflow）：扫描工作文件夹顶层已有文件，
   * 请模型给出 3-5 个澄清问题；若有已有文件，前置一个 `q_files`「如何处理已有文件」选择题。
   * 任何失败都静默返回空问题列表，前端据此直接进入生成。
   */
  async generateClarifyQuestions(
    userInput: string,
    taskType: string,
    taskWorkspacePathRaw: string,
  ): Promise<void> {
    const emit = (questions: Array<{ id: string; text: string; options?: string[] }>): void => {
      this.postMessage({ type: 'clarifyQuestions', questions });
    };
    this.postGenerationProgress(
      'clarify',
      'preparing',
      INPUT_PAGE_BUSY_TITLES.clarifySubmitted,
      '扫描工作文件夹…',
    );
    this.ensurePreExecDraftShell({
      phase: 'clarify',
      userInput,
      taskType,
      taskWorkspacePathRaw,
    });
    try {
      const existingFiles = this.scanExistingTopLevelFiles(taskWorkspacePathRaw);
      const questions: Array<{ id: string; text: string; options?: string[] }> = [];
      if (existingFiles.length > 0) {
        questions.push({
          id: 'q_files',
          text: `工作文件夹中已存在 ${existingFiles.length} 个文件（如 ${existingFiles
            .slice(0, 5)
            .join('、')}${existingFiles.length > 5 ? ' …' : ''}）。希望如何处理？`,
          options: ['重新生成（覆盖已有文件）', '复用已有文件（跳过生成）', '逐个确认（部分复用）'],
        });
      }
      try {
        const llmQuestions = await this.requestClarifyQuestionsFromLlm(userInput, taskType);
        for (const q of llmQuestions.slice(0, 5)) {
          questions.push(q);
        }
      } catch (lmErr) {
        this.warn(`clarify_llm_failed: ${String(lmErr)}`);
      }
      emit(questions);
      if (questions.length > 0) {
        this.debugLog('workflow', 'clarify_questions_emitted', 0, { count: questions.length });
      } else {
        this.postMessage({
          type: 'polishSessionHint',
          message: '未生成澄清问题（可能因模型输出不完整），可直接点击「生成工作流」继续。',
        });
      }
    } catch (e) {
      this.warn(`clarify_failed: ${String(e)}`);
      emit([]);
      this.postMessage({
        type: 'polishSessionHint',
        message: '澄清步骤失败，可直接点击「生成工作流」继续。',
      });
    }
  }

  /** 扫描工作文件夹顶层非隐藏文件（最多 20 个），用于澄清与复用提示。 */
  private scanExistingTopLevelFiles(taskWorkspacePathRaw: string): string[] {
    const res = this.resolveExistingDirectoryPath(taskWorkspacePathRaw);
    if (!res.ok) {
      return [];
    }
    try {
      return fs
        .readdirSync(res.abs, { withFileTypes: true })
        .filter((d) => d.isFile() && !d.name.startsWith('.'))
        .map((d) => d.name)
        .slice(0, 20);
    } catch {
      return [];
    }
  }

  private async requestClarifyQuestionsFromLlm(
    userInput: string,
    taskType: string,
  ): Promise<Array<{ id: string; text: string; options?: string[] }>> {
    const systemPrompt =
      '你是需求澄清助手。基于用户的任务描述，提出最多 3 个最关键的澄清问题，帮助后续更准确地拆解工作流。' +
      '仅输出 JSON：{"questions":[{"id":"q1","text":"…","options":["…"]}]}。' +
      'options 可省略（开放式问答）；不要输出除 JSON 外的任何文字。';
    const userPayload = `taskType: ${taskType}\n\n用户任务：\n${userInput}`;
    this.postGenerationProgress(
      'clarify',
      'llm',
      INPUT_PAGE_BUSY_TITLES.clarifySubmitted,
      '正在调用模型生成澄清问题…',
    );
    let raw = await this.invokeLlmRaw(systemPrompt, userPayload, 'clarify-questions', {
      requireStructured: true,
      jsonMode: true,
    });
    let parsed = this.parseClarifyQuestionsJson(raw);
    if (parsed.length === 0 && isLikelyTruncatedJson(raw)) {
      this.debugLog('workflow', 'clarify_json_truncated', 0, { rawChars: raw.length });
      this.postGenerationProgress(
        'clarify',
        'llm',
        INPUT_PAGE_BUSY_TITLES.clarifySubmitted,
        '模型输出不完整，正在续写一次…',
      );
      const continuation = await this.invokeLlmRaw(
        buildJsonContinuationPrompt(raw),
        '',
        'clarify-questions-continue',
        { requireStructured: true },
      );
      raw = raw + continuation;
      parsed = this.parseClarifyQuestionsJson(raw);
    }
    if (parsed.length === 0) {
      this.debugLog('workflow', 'clarify_parse_empty', 0, { rawChars: raw.length });
    }
    return parsed;
  }

  private parseClarifyQuestionsJson(
    raw: string,
  ): Array<{ id: string; text: string; options?: string[] }> {
    const jsonStr = extractJsonObject(raw);
    if (jsonStr) {
      try {
        const obj = JSON.parse(jsonStr) as { questions?: unknown };
        const normalized = this.normalizeClarifyQuestionsArray(obj.questions);
        if (normalized.length > 0) {
          return normalized;
        }
      } catch {
        /* lenient fallback below */
      }
    }
    const lenient = lenientExtractClarifyQuestions(raw);
    if (lenient.length > 0) {
      this.debugLog('workflow', 'clarify_lenient_parse', 0, { count: lenient.length, rawChars: raw.length });
    }
    return lenient;
  }

  private normalizeClarifyQuestionsArray(
    arr: unknown,
  ): Array<{ id: string; text: string; options?: string[] }> {
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

  async generateWorkflow(
    userInput: string,
    taskType: string,
    taskWorkspacePathRaw: string,
    polishContext?: { originalDraft: string; polishedAt: string },
    clarifyAnswers?: Record<string, string>,
  ): Promise<void> {
    const wsRes = this.resolveExistingDirectoryPath(taskWorkspacePathRaw);
    if (!wsRes.ok) {
      this.postMessage({
        type: 'workflowFailed',
        reason: wsRes.reason,
        errorType: 'invariant-violation',
      });
      return;
    }
    const taskWorkspaceAbs = wsRes.abs;

    this.ensurePreExecDraftShell({
      phase: 'generate',
      userInput,
      taskType,
      taskWorkspacePathRaw: taskWorkspaceAbs,
    });

    this.postGenerationProgress(
      'workflow',
      'preparing',
      INPUT_PAGE_BUSY_TITLES.workflowPreparing,
      '扫描代码库快照、依赖图、复杂度与经验库…',
    );

    const cfg = this.platform.config;
    const codebaseSnapshot = readCodebaseContextEnabled(cfg)
      ? buildCodebaseSnapshot(taskWorkspaceAbs)
      : undefined;
    let codebaseContext = '';
    if (codebaseSnapshot) {
      const configuredMax = readCodebaseContextMaxTokens(cfg);
      const fullPreview = formatSnapshotForPrompt(codebaseSnapshot, 'full');
      const tokenEst = estimateTextTokens(fullPreview);
      const { allocations } = allocateContextBudget([], DEFAULT_CONTEXT_TOTAL_TOKEN_LIMIT, {
        includeCodebaseSnapshot: true,
        codebaseSnapshotTokens: tokenEst,
      });
      const granted =
        allocations.find((a) => a.category === 'codebase-snapshot')?.grantedTokens ?? configuredMax;
      const budgetTokens = Math.min(configuredMax, granted);
      const degraded = applySnapshotDegradation(codebaseSnapshot, budgetTokens);
      codebaseContext = degraded.text;
      this.debugLog('workflow', 'codebase_snapshot', 0, {
        level: degraded.level,
        tokenBudget: budgetTokens,
        tokens: estimateTextTokens(degraded.text),
      });
    }

    const complexity = estimateWorkflowComplexity(userInput, codebaseSnapshot);
    const complexityBlock = formatComplexityBlockForPrompt(complexity);
    if (codebaseContext) {
      codebaseContext = `${codebaseContext}\n\n${complexityBlock}`;
    } else {
      codebaseContext = complexityBlock;
    }

    const depGraph = buildDependencyGraph(resolveSrcDirForWorkspace(taskWorkspaceAbs));
    const depGraphPrompt = formatDependencyGraphForPrompt(depGraph);
    if (depGraphPrompt) {
      codebaseContext = `${codebaseContext}\n\n${depGraphPrompt}`;
    }

    let promptSlots: Partial<Record<ManagedPromptSlotName, string>> | undefined;
    if (readPromptVersionsEnabled(cfg)) {
      const loaded = loadManagedPromptSlots(resolveDefaultPromptVersionStorePath(taskWorkspaceAbs));
      promptSlots = loaded as Partial<Record<ManagedPromptSlotName, string>>;
      this.debugLog('workflow', 'prompt_versions_loaded', 0, {
        slots: Object.keys(loaded),
      });
    }

    let experienceFewShot = '';
    if (readExperienceInjectOnGenerate(cfg)) {
      const store = new WorkflowExperienceStore(resolveExperienceStorePath(taskWorkspaceAbs));
      experienceFewShot = buildExperienceFewShotForGenerator(store.readAll(), {
        taskType,
        maxEntries: 3,
      });
      if (experienceFewShot) {
        this.debugLog('workflow', 'experience_few_shot', 0, { chars: experienceFewShot.length });
      }
    }

    const systemPrompt = buildWorkflowGeneratorPrompt(taskType, {
      userInput,
      codebaseContext,
      experienceFewShot,
      promptSlots,
    });

    const userPayload = isAutoTaskType(taskType)
      ? `taskType: auto（请根据用户任务在 meta.taskType 中选择其一）\n\n用户任务：\n${userInput}`
      : `taskType: ${taskType}（用户指定覆盖）\n\n用户任务：\n${userInput}`;

    try {
      this.postGenerationProgress(
        'workflow',
        'llm',
        INPUT_PAGE_BUSY_TITLES.workflowLlm,
        buildLlmWaitingDetail(isAutoTaskType(taskType)),
      );
      // 解析/异常类失败自动修复重试：单次 LLM 输出无法提取/解析为 JSON 时，先就地修复，
      // 仍失败则整轮重新生成一次（最多 MAX_WORKFLOW_GEN_ATTEMPTS 次），全部失败才推送 workflowFailed。
      const MAX_WORKFLOW_GEN_ATTEMPTS = 2;
      // S2：opt-in skill-native 编排（默认关闭）。命中则直接产出 grill native 工作流，
      // 跳过 LLM 生成循环；其余 normalize/validate/post/persist 与 LLM 路径完全共用。
      let wf: WorkflowDefinition | undefined = this.tryAssembleSkillNativeWorkflow(
        userInput,
        taskType,
        taskWorkspaceAbs,
      );
      let lastParseError: Error | undefined;
      for (let attempt = 1; !wf && attempt <= MAX_WORKFLOW_GEN_ATTEMPTS; attempt++) {
        if (attempt > 1) {
          this.postGenerationProgress(
            'workflow',
            'llm',
            INPUT_PAGE_BUSY_TITLES.workflowLlm,
            `上次输出无法解析为 JSON，正在自动重试（第 ${attempt}/${MAX_WORKFLOW_GEN_ATTEMPTS} 次）…`,
          );
        }
        const wfMaxTokens = readLlmMaxOutputTokens(this.platform.config);
        const raw = await this.invokeLlmRaw(systemPrompt, userPayload, 'workflow-gen', {
          requireStructured: true,
          jsonMode: true,
          maxTokens: wfMaxTokens,
        });
        this.postGenerationProgress(
          'workflow',
          'parsing',
          '正在解析模型输出',
          '提取 JSON 并必要时请求修复…',
        );
        try {
          wf = await this.parseWorkflowJson(raw);
          break;
        } catch (parseErr) {
          lastParseError = parseErr instanceof Error ? parseErr : new Error(String(parseErr));
          this.debugLog('workflow', 'parse_failed_retry', 0, {
            attempt,
            maxAttempts: MAX_WORKFLOW_GEN_ATTEMPTS,
            error: lastParseError.message.slice(0, 200),
          });
        }
      }
      if (!wf) {
        throw lastParseError ?? new Error('工作流生成失败：模型输出无法解析为 JSON');
      }
      // S4：混合模式——在引擎生成的 impl 工作流前插入 native grill 决策阶段（opt-in）。
      wf = this.maybePrependHybridGrill(wf, userInput, taskWorkspaceAbs);
      const modelTaskType = wf.meta?.taskType;
      const effectiveType = resolveGeneratedTaskType(modelTaskType, taskType);
      this.debugLog('workflow', 'task_type_resolved', 0, {
        uiTaskType: taskType,
        modelTaskType: modelTaskType ?? '(missing)',
        effectiveType,
      });
      wf = this.normalizeWorkflow(wf, userInput, effectiveType);
      wf.meta = { ...wf.meta, taskType: effectiveType, taskWorkspacePath: taskWorkspaceAbs };
      if (polishContext?.originalDraft?.trim() && polishContext.polishedAt) {
        wf.meta = {
          ...wf.meta,
          userInputPolish: {
            originalDraft: polishContext.originalDraft.trim().slice(0, POLISH_META_DRAFT_MAX),
            polishedAt: polishContext.polishedAt,
          },
        };
      }
      // 生成前澄清结果：q_files 答案 → reuseStrategy；记录扫描到的已有文件。
      const reuseStrategy = resolveReuseStrategyFromClarify(clarifyAnswers?.q_files);
      if (reuseStrategy !== 'regenerate') {
        const existingFiles = this.scanExistingTopLevelFiles(taskWorkspaceAbs);
        wf.meta = {
          ...wf.meta,
          reuseStrategy,
          ...(existingFiles.length > 0 ? { existingFiles } : {}),
        };
        this.debugLog('workflow', 'clarify_reuse_strategy', 0, {
          reuseStrategy,
          existingFiles: this.scanExistingTopLevelFiles(taskWorkspaceAbs).length,
        });
      }

      this.postGenerationProgress(
        'workflow',
        'validating',
        INPUT_PAGE_BUSY_TITLES.workflowValidating,
        '校验字段、Rule20 与静态分析…',
      );

      const prepared = validateAndPrepareGeneratedWorkflow(wf, effectiveType);
      if (prepared.errors.length > 0) {
        if (this.postBlockedConfirmIfRenderable(prepared.workflow, prepared.errors)) {
          return;
        }
        this.postMessage({
          type: 'workflowFailed',
          reason: prepared.errors.join('; '),
          errorType: 'invariant-violation',
        });
        return;
      }
      wf = prepared.workflow;

      // === M14.4 / v2.8.1 I-23：运行时 verifyRule20（默认 ON，仍不阻断）===
      const runtimeRule20On = this.isRuntimeRule20VerifyEnabled();
      const verifyResult = runtimeRule20On ? verifyRule20(wf) : undefined;

      if (shouldBlockGenerateOnRule20Violations(verifyResult, runtimeRule20On)) {
        const rule20Reason = formatRule20ViolationsBlockReason(verifyResult!.violations);
        if (this.postBlockedConfirmIfRenderable(wf, [rule20Reason])) {
          return;
        }
        this.postMessage({
          type: 'workflowFailed',
          reason: rule20Reason,
          errorType: 'invariant-violation',
        });
        return;
      }

      // === M27.1/M27.2（P0）：多文件 prototype/software 计划完整性硬门 ===
      // 缺可执行验证阶段 / 缺 main 装配 / 样例与 mock 未共享 ASIN 源时阻断生成。
      if (readPlanCompletenessGateEnabled(cfg)) {
        const planIssues = lintPlanCompleteness(wf);
        if (planIssues.length > 0) {
          const planReason = formatPlanCompletenessBlockReason(planIssues);
          if (this.postBlockedConfirmIfRenderable(wf, [planReason])) {
            return;
          }
          this.postMessage({
            type: 'workflowFailed',
            reason: planReason,
            errorType: 'invariant-violation',
          });
          return;
        }
      }

      const warnings = buildGeneratorWarnings({
        stageCount: wf.stages.length,
        maxStageWarn: MAX_STAGES_WARN,
        verifyResult,
        enableRuntimeRule20Verify: runtimeRule20On,
      });
      const overrideWarn = buildTaskTypeOverrideWarning(taskType, modelTaskType, effectiveType);
      if (overrideWarn) {
        warnings.push(overrideWarn);
      }
      if (isAutoTaskType(taskType)) {
        if (!modelTaskType?.trim()) {
          warnings.push(`taskType:missing-meta:fallback-${effectiveType}`);
        } else if (!isKnownTaskType(modelTaskType)) {
          warnings.push(`taskType:invalid-meta:${modelTaskType}:using-${effectiveType}`);
        }
      }
      const depGraphWarnings = dependencyGraphToWarningLines(depGraph);
      warnings.push(...depGraphWarnings);
      warnings.push(...complexityEstimateToWarningLines(complexity));
      if (fs.existsSync(path.join(taskWorkspaceAbs, 'tsconfig.json'))) {
        warnings.push('static-analysis:typescript:recommend-post-impl');
      }
      if (readStaticAnalysisEnabled(cfg)) {
        const checks = buildDefaultWorkspaceChecks(taskWorkspaceAbs);
        if (checks.length > 0) {
          const analysisResults = await runStaticAnalysis(checks, taskWorkspaceAbs);
          warnings.push(...analysisResultsToWarningLines(analysisResults));
          const suggested = suggestVerificationStages(analysisResults, wf.stages);
          if (suggested.length > 0) {
            warnings.push('static-analysis:suggest-tsc-stage');
          }
          this.debugLog('workflow', 'static_analysis_on_generate', 0, {
            checks: checks.map((c) => c.type),
            failed: analysisResults.filter((r) => !r.passed && !r.skipped).length,
          });
        }
      }
      if (verifyResult) {
        this.debugLog('workflow', 'rule20_runtime_verify', 0, {
          enabled: runtimeRule20On,
          ...summarizeRule20VerifyForLog(verifyResult),
          warningTokens: warnings,
        });
      }
      const warningsDisplay = formatWorkflowGeneratedWarningsForDisplay(warnings);
      const planSummary = buildPlanSummary(wf, { complexity, warnings });
      const stageSourceSummary = buildStageSourceSummary(wf);

      const draftKey = this.finalizeDraftDefinition(wf);

      this.postMessage({
        type: 'workflowGenerated',
        workflow: wf,
        warnings,
        warningsDisplay,
        planSummary,
        stageSourceSummary,
        instanceKey: draftKey,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (this.instance && this.currentInstanceKey) {
        this.debugLog('workflow', 'gen_failed', 0, {
          reason: msg.slice(0, 500),
          errorType: 'llm-invalid-output',
        });
      }
      this.postMessage({
        type: 'workflowFailed',
        reason: msg,
        errorType: 'llm-invalid-output',
      });
    }
  }

  /**
   * A 方案：硬门禁拦截后，若工作流结构可渲染，则仍推送只读确认页（blocked=true），
   * 让用户在确认页直接看到「会写哪些文件 / 阶段怎么排 / 哪里要人工审」与拦截原因，
   * 而非退回输入页只剩润色全文。返回 true 表示已推送、调用方应直接 return。
   */
  private postBlockedConfirmIfRenderable(
    wf: WorkflowDefinition,
    blockReasons: string[],
  ): boolean {
    if (!isRenderableWorkflowForConfirm(wf)) {
      return false;
    }
    const draftKey = this.finalizeDraftDefinition(wf);
    this.postMessage({
      type: 'workflowGenerated',
      workflow: wf,
      blocked: true,
      blockReasons,
      warnings: [],
      warningsDisplay: [],
      planSummary: undefined,
      stageSourceSummary: buildStageSourceSummary(wf),
      instanceKey: draftKey,
    });
    return true;
  }

  /**
   * 从模型原始输出解析出 WorkflowDefinition：先提取 JSON 对象，提取失败则请求模型修复后再提取；
   * 提取到疑似 JSON 但 `JSON.parse` 失败时，再走一轮修复。任一步彻底失败则抛错（由调用方决定重试/上报）。
   */
  private async parseWorkflowJson(
    raw: string,
  ): Promise<WorkflowDefinition> {
    let jsonStr = extractJsonObject(raw);
    if (!jsonStr && isLikelyTruncatedJson(raw)) {
      // #1 进阶：工作流 JSON 被截断 → 续写并拼接后重试提取。
      const continuation = await this.invokeLlmRaw(
        buildJsonContinuationPrompt(raw),
        '',
        'workflow-gen-continue',
        { requireStructured: true },
      );
      jsonStr = extractJsonObject(raw + continuation);
    }
    if (!jsonStr) {
      const repaired = await this.repairWorkflowJson(raw);
      jsonStr = extractJsonObject(repaired);
    }
    if (!jsonStr) {
      throw new Error(`无法从模型输出中解析 JSON。原始输出片段：\n${safeSnippet(raw)}`);
    }
    try {
      return JSON.parse(jsonStr) as WorkflowDefinition;
    } catch {
      const repaired = await this.repairWorkflowJson(jsonStr);
      const repairedStr = extractJsonObject(repaired);
      if (!repairedStr) {
        throw new Error(`提取到的 JSON 无法解析。片段：\n${safeSnippet(jsonStr)}`);
      }
      return JSON.parse(repairedStr) as WorkflowDefinition;
    }
  }

  private async repairWorkflowJson(raw: string): Promise<string> {
    const repairPrompt = `你将收到一段本应为 WorkflowDefinition(JSON) 的文本，但可能夹杂解释文字或格式错误。
任务：只输出一个可被 JSON.parse 解析的 JSON 对象，不要 markdown，不要解释。
要求：
1) 保留原字段语义，补齐必要字段；
2) version 必须是 "2.0"；
3) stages 必须是数组；
4) 如果无法修复，请至少输出 {"id":"wf_invalid","version":"2.0","meta":{"title":"invalid","taskType":"software","userInput":"","createdAt":"${new Date().toISOString()}"},"stages":[]}。`;
    return this.invokeLlmRaw(repairPrompt, raw, 'workflow-gen-repair', {
      requireStructured: true,
      jsonMode: true,
    });
  }

  /**
   * S2：opt-in 把「场景路由 + 原版 SKILL.md」编排为 skill-native 工作流（grill 为决策阶段）。
   * - 默认关闭：仅当 `skillNative.enabled=true` 且配置了 `skillNative.skillsRoot` 时启用。
   * - 失败 / 空 registry / 无阶段 → 返回 undefined，安全回退到 LLM 生成路径。
   * 见 stagent_docs/SKILLS-ENGINE-INTEGRATION.md。
   */
  private tryAssembleSkillNativeWorkflow(
    userInput: string,
    taskType: string,
    taskWorkspaceAbs: string,
  ): WorkflowDefinition | undefined {
    const cfg = this.platform.config;
    if (!cfg.get<boolean>('skillNative.enabled', false)) {
      return undefined;
    }
    const skillsRoot = (cfg.get<string>('skillNative.skillsRoot', '') ?? '').trim();
    if (!skillsRoot) {
      this.debugLog('workflow', 'skill_native_no_root', 0, {});
      return undefined;
    }
    try {
      const registry = new SkillRegistry({ skillsRoot });
      const loaded = registry.load();
      if (loaded === 0) {
        this.debugLog('workflow', 'skill_native_empty_registry', 0, { skillsRoot });
        return undefined;
      }
      const isGreenfield = this.scanExistingTopLevelFiles(taskWorkspaceAbs).length === 0;
      const { workflow, route, skipped } = assembleSkillWorkflow(
        { taskType, repo: { isGreenfield } },
        registry,
        { bundle: { userTask: userInput }, meta: { userInput, taskType } },
      );
      this.debugLog('workflow', 'skill_native_generation', 0, {
        template: route.template,
        stages: workflow.stages.length,
        skipped,
        loaded,
      });
      return workflow.stages.length > 0 ? workflow : undefined;
    } catch (e) {
      this.debugLog('workflow', 'skill_native_failed', 0, {
        error: e instanceof Error ? e.message : String(e),
      });
      return undefined;
    }
  }

  /**
   * S4 混合模式（opt-in）：在引擎/LLM 生成的 impl 工作流**前面**插入 native grill 决策阶段，
   * 实现「原版 grill 判断 + 引擎 impl/test/Rule20/自愈/写文件」一条龙——开发高质量软件。
   * - `skillNative.hybridGrill=true` 且配 `skillNative.skillsRoot` 时启用。
   * - 若 wf 已是 skill-native（planning-only 路径产物），不重复插入。
   * - 任意失败安全回退（返回原 wf）。
   */
  private maybePrependHybridGrill(
    wf: WorkflowDefinition,
    userInput: string,
    taskWorkspaceAbs: string,
  ): WorkflowDefinition {
    const cfg = this.platform.config;
    if (!cfg.get<boolean>('skillNative.hybridGrill', false)) {
      return wf;
    }
    if (isSkillNativeWorkflow(wf)) {
      return wf;
    }
    const skillsRoot = (cfg.get<string>('skillNative.skillsRoot', '') ?? '').trim();
    if (!skillsRoot) {
      return wf;
    }
    try {
      const registry = new SkillRegistry({ skillsRoot });
      registry.load();
      const skill = registry.get(SKILL_GRILL_WITH_DOCS);
      if (!skill) {
        this.debugLog('workflow', 'hybrid_grill_skill_missing', 0, { skillsRoot });
        return wf;
      }
      const isGreenfield = this.scanExistingTopLevelFiles(taskWorkspaceAbs).length === 0;
      const next = prependGrillStage(wf, skill, {
        userTask: userInput,
        repoSnapshot: `isGreenfield=${isGreenfield}`,
      });
      this.debugLog('workflow', 'hybrid_grill_prepended', 0, {
        grill: SKILL_GRILL_WITH_DOCS,
        version: skill.version,
        stages: next.stages.length,
      });
      return next;
    } catch (e) {
      this.debugLog('workflow', 'hybrid_grill_failed', 0, {
        error: e instanceof Error ? e.message : String(e),
      });
      return wf;
    }
  }

  private normalizeWorkflow(wf: WorkflowDefinition, userInput: string, taskType: string): WorkflowDefinition {
    const createdAt = wf.meta?.createdAt ?? new Date().toISOString();
    const normalized: WorkflowDefinition = {
      ...wf,
      version: '2.0',
      id: wf.id || `wf_${crypto.randomUUID()}`,
      meta: {
        title: wf.meta?.title ?? '生成的工作流',
        taskType: wf.meta?.taskType ?? taskType,
        userInput: wf.meta?.userInput ?? userInput,
        createdAt,
        isGreenfield: wf.meta?.isGreenfield,
        taskWorkspacePath: wf.meta?.taskWorkspacePath,
      },
    };

    // 防御：模型常漏写 stages / 某些 stage 漏写 outputs。归一化逻辑会先于结构校验运行并直接读
    // stage.outputs.some(...)，若不兜底会抛 TypeError 被外层 catch 吞成 workflowFailed，导致即便
    // JSON 已生成也无法跳到（哪怕只读的）确认页。此处统一补齐为数组，后续真为空时由校验给出清晰提示。
    if (!Array.isArray(normalized.stages)) {
      normalized.stages = [];
    }
    for (const stage of normalized.stages) {
      if (!Array.isArray(stage.outputs)) {
        stage.outputs = [];
      }
      // 同理兜底 input：模型截断时常漏写整个 input（如生成被截断的尾部阶段），
      // 下游 WorkflowDag / Rule20 / 契约 lint 直接读 stage.input.sources，
      // 若不补齐会抛 "Cannot read properties of undefined (reading 'sources')"，
      // 把本可在确认页清晰提示的「不合法工作流」吞成晦涩崩溃。
      if (!stage.input || typeof stage.input !== 'object') {
        stage.input = { sources: [], mergeStrategy: 'concat' };
      } else if (!Array.isArray(stage.input.sources)) {
        stage.input.sources = [];
      }
    }

    if (normalized.meta.taskType === 'software' && normalized.stages.length > 0) {
      const hasDecision = normalized.stages.some((s) => s.isDecisionStage);
      if (!hasDecision) {
        const first = normalized.stages[0];
        first.isDecisionStage = true;
        first.pauseAfter = true;
        if (!first.outputs.some((o) => o.key === 'decisionRecord')) {
          first.outputs.unshift({ key: 'decisionRecord', format: 'markdown' });
        }
        if (first.tool !== 'llm-text') {
          first.tool = 'llm-text';
          first.toolConfig = {
            type: 'llm-text',
            systemPrompt: ensureDecisionPromptStrict(
              '你是资深工程师。请先输出可审核的决策清单（DecisionRecord），再进入实现，禁止仅返回拒绝句。',
            ),
          };
        }
      }
    }

    // 对所有决策阶段统一收紧 prompt，尽量首轮即命中 §4.4 四节格式
    for (const stage of normalized.stages) {
      if (!stage.isDecisionStage || stage.tool !== 'llm-text') {
        continue;
      }
      const tc = stage.toolConfig as { type: 'llm-text'; systemPrompt?: string };
      const basePrompt = tc.systemPrompt?.trim() || '请输出可审核的决策清单（DecisionRecord）。';
      tc.systemPrompt = ensureDecisionPromptStrict(basePrompt);
      stage.pauseAfter = true;
      if (!stage.outputs.some((o) => o.key === 'decisionRecord')) {
        stage.outputs.unshift({ key: 'decisionRecord', format: 'markdown' });
      }
    }

    // Rule 20-G 兜底：zoom_out 阶段确保 filePath 可读，避免执行期 file-not-found。
    for (const stage of normalized.stages) {
      if (stage.id !== 'stage_zoom_out' || stage.tool !== 'file-read') {
        continue;
      }
      const cfg = stage.toolConfig as Partial<FileReadConfig>;
      (stage.toolConfig as FileReadConfig).filePath = this.pickZoomOutFilePath(cfg.filePath);
    }

    // M20 兜底：模型常把 writeOutputToFile / writePathBase 误放在阶段顶层（与 toolConfig 平级），
    // 导致 artifact 注册表（仅读 toolConfig.writeOutputToFile）收集为空、执行期不落盘且 code-runner 报
    // python-script-not-in-artifacts。统一提升进 toolConfig，保持注册表/执行器/lint/UI 一致。
    hoistStageWriteOutputToToolConfig(normalized);

    // M7 兜底：兼容模型输出 question/prompt/title 字段，避免执行前追问显示 undefined。
    for (const stage of normalized.stages) {
      stage.questionBefore = normalizeQuestions(stage.questionBefore, stage.id, 'before');
      stage.questionAfter = normalizeQuestions(stage.questionAfter, stage.id, 'after');

      // M7 纠偏：模型有时把执行前问题错误写进 questionAfter，且 pauseAfter=false 触发 I-6。
      // 对 impl 阶段自动迁移到 questionBefore，优先保证 waiting-questions 链路可执行。
      if (
        /^stage_impl_/.test(stage.id) &&
        stage.pauseAfter === false &&
        (stage.questionAfter?.length ?? 0) > 0
      ) {
        const mergedBefore = [...(stage.questionBefore ?? []), ...stage.questionAfter!];
        stage.questionBefore = normalizeQuestions(mergedBefore, stage.id, 'before');
        stage.questionAfter = undefined;
      }
    }
    return normalized;
  }

  /** `direct:` family 走 HTTP 通道（OpenAI 兼容），其余走 lm-api。 */
  private llmChannel(model: LlmModel): 'http' | 'lm-api' {
    return model.family.startsWith('direct:') ? 'http' : 'lm-api';
  }

  /** 消费 LlmModel 文本增量流，推送 streamChunk 并写 llm_stream_summary */
  private async consumeLlmStream(
    stream: AsyncIterable<string>,
    channel: 'http' | 'lm-api',
    traceStageId: string,
    retried: boolean,
    onActivity?: () => void,
  ): Promise<string> {
    let full = '';
    let stats: StreamStats = emptyStreamStats();
    for await (const frag of stream) {
      onActivity?.();
      full += frag;
      stats = appendStreamChunk(stats, frag, new Date().toISOString());
      this.postMessage({ type: 'streamChunk', stageId: traceStageId, chunk: frag });
    }
    this.logUserAction(
      'llm_stream_summary',
      buildLlmStreamSummary(traceStageId, stats, { retried, channel }),
    );
    return full;
  }

  private async invokeLlmRaw(
    systemPrompt: string,
    userContent: string,
    traceStageId: string,
    opts?: { requireStructured?: boolean; jsonMode?: boolean; maxTokens?: number },
  ): Promise<string> {
    const idleMs = readLlmTimeoutMs(this.platform.config);
    const ac = new AbortController();
    // 空闲超时：只要流持续吐字就不取消，仅连续 idleMs 无新增量才判定卡死。
    const idle = createIdleTimeout(idleMs, () => ac.abort());
    const onActivity = (): void => idle.reset();
    try {
      const apiKey = this.platform.config.get<string>('llmApiKey', '').trim();
      if (this.preferredModelFamily?.startsWith('direct:') && !apiKey) {
        throw new Error('已选择「直接 API」模型但未配置 stagent.llmApiKey');
      }
      const models = opts?.requireStructured
        ? await this.selectStructuredModels()
        : await this.selectPreferredModels();
      if (models.length === 0) {
        throw new Error('未配置 GitHub Copilot 语言模型且无 stagent.llmApiKey，无法生成工作流');
      }
      const model = models[0];
      const channel = this.llmChannel(model);
      // #2：JSON 调用下发 jsonMode，支持的真实 API 会启用 response_format。
      // onActivity：把空闲计时器的 reset 透传给流式解析器，使推理模型作答前的
      // 思维链（reasoning_content）流量也算「存活」，避免长思考被误杀。
      const jsonMaxTokens =
        typeof opts?.maxTokens === 'number' && Number.isFinite(opts.maxTokens)
          ? Math.floor(opts.maxTokens)
          : 2048;
      const sendOptions: LlmSendOptions = {
        onActivity,
        ...(opts?.jsonMode ? { jsonMode: true, maxTokens: jsonMaxTokens } : {}),
      };
      const prompt = buildLlmInvokePrompt(systemPrompt, userContent);
      // LLM 追溯：有实例时写入 .wf-debug.log，否则 fallback sessionLog。
      this.llmTraceLog(traceStageId, 'llm_start', {
        model: model.family,
        requireStructured: !!opts?.requireStructured,
        jsonMode: !!opts?.jsonMode,
        ...(opts?.jsonMode ? { maxTokens: jsonMaxTokens } : {}),
        promptChars: prompt.length,
      });
      const full = await this.consumeLlmStream(
        model.sendRequest([{ role: 'user', content: prompt }], sendOptions, ac.signal),
        channel,
        traceStageId,
        false,
        onActivity,
      );
      if (looksLikeRefusal(full)) {
        const retryPrompt = buildLlmRefusalRetryPrompt(prompt);
        const retried = await this.consumeLlmStream(
          model.sendRequest([{ role: 'user', content: retryPrompt }], sendOptions, ac.signal),
          channel,
          traceStageId,
          true,
          onActivity,
        );
        if (!looksLikeRefusal(retried) && retried.trim().length > 0) {
          this.llmTraceLog(traceStageId, 'llm_end', {
            model: model.family,
            refusalRetry: true,
            responseChars: retried.length,
            preview: retried.slice(0, 200),
          });
          return retried;
        }
      }
      this.llmTraceLog(traceStageId, 'llm_end', {
        model: model.family,
        responseChars: full.length,
        preview: full.slice(0, 200),
      });
      return full;
    } catch (e) {
      this.llmTraceLog(traceStageId, 'llm_error', {
        error: e instanceof Error ? e.message : String(e),
      });
      throw new Error(formatLlmUserFacingError(e, idleMs));
    } finally {
      idle.clear();
    }
  }

  /**
   * startExecution 实例复用：idle / failed / completed 且传入 instanceKey 时保留 key 与 taskDir。
   * running 不可 reuse-start（应 resume + approve/retry）。
   */
  private resolveReuseInstance(instanceKey?: string): {
    reuse: boolean;
    existing?: WorkflowInstance;
    instanceId: string;
  } {
    if (!instanceKey) {
      return { reuse: false, instanceId: crypto.randomUUID() };
    }
    const existing =
      this.currentInstanceKey === instanceKey && this.instance
        ? this.instance
        : this.loadInstanceByKey(instanceKey);
    const reusable =
      existing?.status === 'idle' ||
      existing?.status === 'failed' ||
      existing?.status === 'completed';
    const reuse = !!existing && reusable && !!existing.taskDir;
    return {
      reuse,
      existing: reuse ? existing : undefined,
      instanceId: reuse ? instanceKey : crypto.randomUUID(),
    };
  }

  async startExecution(workflowOverride?: WorkflowDefinition, instanceKey?: string): Promise<void> {
    if (!workflowOverride) {
      void this.platform.notify.error('缺少工作流定义');
      return;
    }

    let wf = workflowOverride;

    const invErrors = validateGeneratedWorkflow(wf);
    if (invErrors.length > 0) {
      this.postMessage({
        type: 'workflowFailed',
        reason: invErrors.join('; '),
        errorType: 'invariant-violation',
      });
      return;
    }

    // === M14.2 I-21：startExecution 入场必走 normalizeWorkflow ===
    // 防止外部 JSON / 用户编辑后启动时绕过 ensureDecisionPromptStrict 与 Question 归一化。
    // userInput / taskType 从 wf.meta 兜底（normalizeWorkflow 内部仅在 meta 缺字段时使用）。
    wf = this.normalizeWorkflow(wf, wf.meta?.userInput ?? '', wf.meta?.taskType ?? 'software');

    // M2.1: I-1 防御性检查（normalizeWorkflow 已确保决策阶段 tool='llm-text'；保留作最后一道防线）
    for (const stage of wf.stages) {
      if (stage.isDecisionStage && stage.tool !== 'llm-text') {
        this.postMessage({
          type: 'stageError',
          stageId: stage.id,
          error: '不变式 I-1：决策阶段必须使用 llm-text',
          errorType: 'invariant-violation',
        });
        this.postMessage({
          type: 'workflowFailed',
          reason: 'generated_workflow_failed_invariant_check',
          errorType: 'invariant-violation',
          stageId: stage.id,
        });
        return;
      }
      if (stage.isDecisionStage && !stage.outputs.some((o) => o.key === 'decisionRecord')) {
        stage.outputs.push({ key: 'decisionRecord', format: 'markdown' });
      }
    }

    const { reuse, existing, instanceId } = this.resolveReuseInstance(instanceKey);

    if (instanceId !== this.currentInstanceKey) {
      const decision = canSwitchActiveInstance({
        currentKey: this.currentInstanceKey,
        targetKey: instanceId,
        executionDepth: this.executionDepth,
      });
      if (!decision.ok) {
        this.postMessage({
          type: 'instanceSwitchBlocked',
          reason: decision.reason,
          targetInstanceKey: instanceId,
          activeInstanceKey: this.currentInstanceKey,
        });
        return;
      }
      if (this.currentInstanceKey && this.instance) {
        if (this.saveTimer) {
          clearTimeout(this.saveTimer);
          this.saveTimer = undefined;
        }
        this.persistInstanceSnapshot(this.currentInstanceKey, this.instance);
      }
    }

    this.currentInstanceKey = instanceId;

    let taskDir: string;
    if (reuse && existing?.taskDir) {
      taskDir = existing.taskDir;
    } else {
      const taskDirRes = this.resolveInitialTaskDirForStart(instanceId, wf);
      if (!taskDirRes.ok) {
        this.postMessage({
          type: 'workflowFailed',
          reason: taskDirRes.reason,
          errorType: 'invariant-violation',
        });
        return;
      }
      taskDir = taskDirRes.dir;
    }

    const runtimes: StageRuntime[] = wf.stages.map((s) => ({
      stageId: s.id,
      status: 'pending',
      outputs: {},
      retryCount: 0,
    }));

    this.instance = {
      traceId: existing?.traceId ?? `trace_${crypto.randomUUID()}`,
      definition: wf,
      currentStageIndex: 0,
      stageRuntimes: runtimes,
      status: 'running',
      taskDir,
      startedAt: new Date().toISOString(),
      ...(reuse && existing?.artifactRegistry?.length
        ? { artifactRegistry: existing.artifactRegistry }
        : {}),
    };
    this.experiencePersistedForKey = undefined;
    this.debugLog('workflow', 'run_start', 0, {
      workflowId: wf.id,
      stageCount: wf.stages.length,
      reusedInstance: reuse,
      reusedFromStatus: existing?.status,
    });

    this.writeProcessDocs(wf, taskDir);
    this.scheduleSave();
    await this.executeNextStage();
  }

  /**
   * 执行开始时把「需求分析文档」「工作流规划」两份过程文档落盘，
   * 使原始需求 / 润色结果 / 阶段计划随产物一起出现在左侧文件树（可视、可追溯）。
   *
   * 落盘根：优先用 `meta.taskWorkspacePath`（即文件树根、用户可见的输出文件夹）；
   * 这点很关键——文件树会排除 `.stagent/` 目录，而 `taskDir` 恰在
   * `<工作文件夹>/.stagent/instances/<id>/` 之下，写在那里用户根本看不到。
   * 仅当未设置 taskWorkspacePath（无可见根）时才回退 taskDir 兜底保存。
   * 纯辅助：失败仅告警，不阻断执行。
   */
  private writeProcessDocs(wf: WorkflowDefinition, taskDir: string): void {
    const wsRaw = wf.meta?.taskWorkspacePath?.trim();
    const targetDir = wsRaw ? expandUserHomePath(wsRaw) : taskDir;
    try {
      fs.mkdirSync(targetDir, { recursive: true });
      for (const doc of buildWorkflowProcessDocs(wf)) {
        fs.writeFileSync(path.join(targetDir, doc.fileName), doc.content, 'utf8');
      }
    } catch (e) {
      this.warn(`write_process_docs_failed err=${String(e)}`);
    }
  }

  private primaryOutputKey(stage: Stage): string {
    return primaryOutputKey(stage);
  }

  private contentOfSource(source: InputSource, stage: Stage, _runtime: StageRuntime): string {
    if (!this.instance) {
      return '';
    }
    const { definition, stageRuntimes } = this.instance;

    switch (source.type) {
      case 'user-input':
        return definition.meta.userInput;
      case 'constant':
        return source.value ?? '';
      case 'stage-output': {
        const idx = definition.stages.findIndex((s) => s.id === source.stageId);
        if (idx < 0) {
          throw new Error(`stage-not-found:${source.stageId}`);
        }
        const out = stageRuntimes[idx].outputs[source.outputKey ?? ''];
        return truncateStageOutputForInput(stageOutputToText(out), INPUT_TRUNCATE_TOKENS);
      }
      case 'human-answer': {
        const holderId = source.stageId ?? stage.id;
        const idx = definition.stages.findIndex((s) => s.id === holderId);
        if (idx < 0) {
          throw new Error(`stage-not-found:${holderId}`);
        }
        return stageRuntimes[idx].questionAnswers?.[source.questionId ?? ''] ?? '';
      }
      case 'human-answer-before': {
        const holderId = source.stageId ?? stage.id;
        const idx = definition.stages.findIndex((s) => s.id === holderId);
        if (idx < 0) {
          throw new Error(`stage-not-found:${holderId}`);
        }
        return stageRuntimes[idx].questionBeforeAnswers?.[source.questionId ?? ''] ?? '';
      }
      case 'file': {
        const rel = source.filePath?.trim();
        if (!rel) {
          return '';
        }
        let absPath: string;
        if (source.pathBase === 'workspace') {
          const wr = this.getWorkspaceRootAbsolute();
          if (!wr) {
            return `[file:${rel} workspace 根未设置（meta.taskWorkspacePath）]`;
          }
          absPath = this.safeJoinUnderWorkspaceRoot(wr, rel);
        } else if (this.instance.taskDir) {
          absPath = path.join(this.instance.taskDir, rel);
        } else {
          return `[file:${rel} 未解析，taskDir 未设置]`;
        }
        if (!fs.existsSync(absPath)) {
          throw new Error(`file-not-found:${absPath}`);
        }
        return fs.readFileSync(absPath, 'utf-8');
      }
      default:
        return '';
    }
  }

  private readStageOutputSource(source: InputSource, stage: Stage): string {
    if (!this.instance) {
      return '';
    }
    const idx = this.instance.definition.stages.findIndex((s) => s.id === source.stageId);
    if (idx < 0) {
      throw new Error(`stage-not-found:${source.stageId}`);
    }
    const out = this.instance.stageRuntimes[idx].outputs[source.outputKey ?? ''];
    const text = stageOutputToText(out);
    if (text.length === 0) {
      this.warn(`empty-stage-output-source stage=${stage.id} srcStage=${source.stageId} outputKey=${source.outputKey ?? ''}`);
    }
    return text;
  }

  private toReferenceText(source: InputSource, raw: string): string {
    return toReferenceText(source, raw);
  }

  private async summarizeForInput(stageId: string, label: string, raw: string): Promise<string> {
    const prompt = `请将以下内容压缩为 200-300 字中文摘要，保留关键决策、接口约束、风险点；不要代码块。\n\n标签：${label}\n\n原文：\n${raw}`;
    try {
      const models = await this.selectPreferredModels();
      if (models.length === 0) {
        return raw.slice(0, 1200);
      }
      const ac = new AbortController();
      let out = '';
      for await (const frag of models[0].sendRequest([{ role: 'user', content: prompt }], undefined, ac.signal)) {
        out += frag;
      }
      const trimmed = out.trim();
      if (!trimmed) {
        return raw.slice(0, 1200);
      }
      this.warn(`input-degrade-summary stage=${stageId} label=${label}`);
      this.debugLog(stageId, 'degrade_mode_switch', 0, { label, to: 'summary' });
      return trimmed;
    } catch (e) {
      this.warn(`input-summary-failed stage=${stageId} label=${label} err=${String(e)}`);
      return raw.slice(0, 1200);
    }
  }

  private ensureTaskDir(instanceKey: string): string {
    if (!this.instance) {
      return this.getDefaultTaskDir(instanceKey);
    }
    if (!this.instance.taskDir) {
      this.instance.taskDir = this.getDefaultTaskDir(instanceKey);
    }
    fs.mkdirSync(this.instance.taskDir, { recursive: true });
    return this.instance.taskDir;
  }

  private resolveTaskFilePath(instanceKey: string, filePath: string): string {
    const base = this.ensureTaskDir(instanceKey);
    return path.join(base, filePath);
  }

  /** `meta.taskWorkspacePath` 解析为绝对路径；缺失时返回 undefined */
  private getWorkspaceRootAbsolute(): string | undefined {
    return resolveWorkspaceRootAbsolute(this.instance?.definition?.meta?.taskWorkspacePath);
  }

  /**
   * M21.1b / M24 / M26：读取本工作流已落盘 artifact，跑跨文件键名一致性 + 测试质量 lint（warning-only）。
   * run_end 前兜底执行一次（覆盖「没有任何测试阶段」的计划）。读盘失败/文件不足均返回空。
   */
  private async runWorkspaceContractLint(): Promise<string[]> {
    if (!this.instance) {
      return [];
    }
    const bases = [this.getWorkspaceRootAbsolute(), this.instance.taskDir].filter(
      (b): b is string => !!b,
    );
    if (bases.length === 0) {
      return [];
    }
    const registry = collectWorkflowArtifacts(this.instance.definition);
    const files: ProjectFile[] = [];
    for (const rel of registry.paths) {
      if (!/\.(py|json|ya?ml)$/i.test(rel)) {
        continue;
      }
      for (const base of bases) {
        try {
          const abs = path.join(base, rel);
          if (fs.existsSync(abs)) {
            files.push({ path: rel, content: fs.readFileSync(abs, 'utf-8') });
            break;
          }
        } catch {
          // 单文件读失败不影响整体 lint
        }
      }
    }
    if (files.length < 2) {
      return [];
    }
    // M24：若启用词汇表，读 .stagent/CONTEXT.md 作为 canonical 键名权威字典
    let canonicalKeys: string[] | undefined;
    if (readGlossaryEnabled(this.platform.config)) {
      for (const base of bases) {
        try {
          const ctxPath = path.join(base, '.stagent', 'CONTEXT.md');
          if (fs.existsSync(ctxPath)) {
            canonicalKeys = parseGlossary(fs.readFileSync(ctxPath, 'utf-8')).map((e) => e.term);
            break;
          }
        } catch {
          // CONTEXT.md 读失败不影响主 lint
        }
      }
    }
    const warnings = lintCrossFileKeyContract(files, canonicalKeys).warnings;
    // M26：对疑似测试文件做测试质量 lint（无断言 / 恒真 / 仅测存在）—— warning-only
    for (const f of files) {
      if (/(^|\/)(test_|tests?\/).*\.py$|_test\.py$/i.test(f.path)) {
        warnings.push(...testQualityIssuesToWarnings(f.path, lintTestQuality(f.content)));
      }
    }
    return warnings;
  }

  /** 将 relativePath 限制在 root 之下，防止 `..` 逃逸 */
  private safeJoinUnderWorkspaceRoot(root: string, relativePath: string): string {
    return safeJoinUnderWorkspaceRoot(root, relativePath);
  }

  private resolveOutputPath(instanceKey: string, filePath: string, base: ToolPathBase = DEFAULT_TOOL_PATH_BASE): string {
    if (base === 'workspace') {
      const wr = this.getWorkspaceRootAbsolute();
      if (!wr) {
        this.warn('file-write/code-runner pathBase=workspace 但缺少 meta.taskWorkspacePath，回退到 instance 根');
        return this.resolveTaskFilePath(instanceKey, filePath);
      }
      return this.safeJoinUnderWorkspaceRoot(wr, filePath);
    }
    return this.resolveTaskFilePath(instanceKey, filePath);
  }

  private resolveReadableFilePath(instanceKey: string, filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    const roots = this.getReadableProjectRoots();
    for (const root of roots) {
      const candidate = path.join(root, filePath);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    return this.resolveTaskFilePath(instanceKey, filePath);
  }

  private pickZoomOutFilePath(preferred?: string): string {
    return pickZoomOutFilePath(this.getReadableProjectRoots(), preferred);
  }

  private getReadableProjectRoots(): string[] {
    return getReadableProjectRoots(this.platform.paths.workspaceRoot());
  }

  private applyPatchInstructions(
    instanceKey: string,
    instructions: PatchInstruction[],
    runtime: StageRuntime,
    outputKey: string,
    pathBase: ToolPathBase = DEFAULT_TOOL_PATH_BASE,
  ): void {
    for (const ins of instructions) {
      const targetPath = this.resolveOutputPath(instanceKey, ins.filePath, pathBase);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      if (!fs.existsSync(targetPath)) {
        this.debugLog(runtime.stageId, 'patch_file_missing', runtime.retryCount + 1, { filePath: ins.filePath });
        throw new Error(`file-not-found:${targetPath}`);
      }
      const current = fs.readFileSync(targetPath, 'utf-8');
      if (current.includes(ins.search)) {
        const next = current.split(ins.search).join(ins.replace);
        fs.writeFileSync(targetPath, next, 'utf-8');
        this.trackPersistedFile({
          stageId: runtime.stageId,
          outputKey,
          filePath: targetPath,
          content: next,
          existedBefore: true,
          priorContent: current,
        });
        continue;
      }
      const preview = ins.search.slice(0, 50).replace(/\s+/g, ' ');
      this.warn(`patchMode fallback: search 未匹配，file=${ins.filePath}, searchPreview=${preview}`);
      this.debugLog(runtime.stageId, 'patch_fallback', runtime.retryCount + 1, {
        filePath: ins.filePath,
        searchPreview: preview,
      });
      fs.writeFileSync(targetPath, ins.replace, 'utf-8');
      this.trackPersistedFile({
        stageId: runtime.stageId,
        outputKey,
        filePath: targetPath,
        content: ins.replace,
        existedBefore: true,
        priorContent: current,
      });
      runtime.outputs[`_patchFallback_${outputKey}`] = true;
      return;
    }
  }

  private async runCodeRunner(
    cfg: CodeRunnerConfig,
    instanceKey: string,
    stageId: string,
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const pathBase = cfg.pathBase ?? DEFAULT_TOOL_PATH_BASE;
    let cwd: string;
    if (pathBase === 'workspace') {
      const wr = this.getWorkspaceRootAbsolute();
      if (!wr) {
        cwd = this.ensureTaskDir(instanceKey);
      } else {
        const wd = cfg.workingDir ?? '.';
        cwd = path.isAbsolute(wd) ? wd : this.safeJoinUnderWorkspaceRoot(wr, wd);
      }
    } else if (cfg.workingDir) {
      cwd = path.isAbsolute(cfg.workingDir)
        ? cfg.workingDir
        : this.resolveTaskFilePath(instanceKey, cfg.workingDir);
    } else {
      cwd = this.ensureTaskDir(instanceKey);
    }
    const timeoutSec = resolveCodeRunnerTimeoutSeconds(cfg.command, cfg.timeout);
    const timeoutMs = timeoutSec * 1000;
    const sandboxOn = readSandboxEnabled(this.platform.config);
    if (sandboxOn) {
      try {
        const sandboxResult = await runInSandbox(cfg.command, cwd, {
          networkAllowed: resolveSandboxNetworkAllowed(cfg.command),
          timeoutSeconds: timeoutSec,
        });
        if (stageId === STAGE_INIT_NPM_WORKSPACE_ID && sandboxResult.exitCode === 0) {
          try {
            patchNpmDefaultTestScriptAfterInit(cwd);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.warn(`patchNpmDefaultTestScriptAfterInit skipped: ${msg}`);
          }
        }
        return {
          exitCode: sandboxResult.exitCode,
          stdout: sandboxResult.stdout,
          stderr: sandboxResult.stderr,
        };
      } catch (e) {
        const mapped = mapSandboxError(e);
        if (mapped === 'code-runner-timeout') {
          throw new Error('code-runner-timeout');
        }
        if (mapped) {
          throw new Error(`sandbox-error:${mapped}`);
        }
        throw e;
      }
    }
    return new Promise((resolve, reject) => {
      const child = spawn(cfg.command, { cwd, shell: true });
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, timeoutMs);

      child.stdout.on('data', (buf: Buffer) => {
        const text = buf.toString();
        stdout += text;
        this.postMessage({ type: 'streamChunk', stageId, chunk: text });
      });
      child.stderr.on('data', (buf: Buffer) => {
        const text = buf.toString();
        stderr += text;
        this.postMessage({ type: 'streamChunk', stageId, chunk: text });
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (timedOut) {
          reject(new Error('code-runner-timeout'));
          return;
        }
        const exitCode = typeof code === 'number' ? code : 1;
        if (exitCode === 0 && stageId === STAGE_INIT_NPM_WORKSPACE_ID) {
          try {
            patchNpmDefaultTestScriptAfterInit(cwd);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.warn(`patchNpmDefaultTestScriptAfterInit skipped: ${msg}`);
          }
        }
        resolve({ exitCode, stdout, stderr });
      });
    });
  }

  private async resolveInput(
    stage: Stage,
    runtime: StageRuntime,
  ): Promise<string> {
    type ResolveInputEntry = {
      label: string;
      content: string;
      mode: InputDegradeMode;
      preservePriority: boolean;
      source?: InputSource;
      role: InputSourceRole;
    };

    const entries: ResolveInputEntry[] = [];
    for (let index = 0; index < stage.input.sources.length; index++) {
      const source = stage.input.sources[index];
      const label = source.label?.trim() || `source_${index + 1}`;
      if (source.type !== 'stage-output') {
        entries.push({
          label,
          content: this.contentOfSource(source, stage, runtime),
          mode: 'full',
          preservePriority: false,
          source,
          role: 'default',
        });
        continue;
      }

      const raw = this.readStageOutputSource(source, stage);
      const role = classifyStageOutputSource(source);
      const tokens = estimateTokens(raw);
      const planned = resolveExplicitContextDegradeMode(source, tokens, role) ?? planInputDegradeMode(tokens, role);
      const preservePriority = thresholdsForRole(role).preserveOnTotalOverflow;

      if (planned === 'full') {
        entries.push({ label, content: raw, mode: 'full', preservePriority, source, role });
      } else if (planned === 'summary') {
        const summary = await this.summarizeForInput(stage.id, label, raw);
        entries.push({ label, content: summary, mode: 'summary', preservePriority, source, role });
      } else {
        this.warn(`input-degrade-reference stage=${stage.id} label=${label}`);
        this.debugLog(stage.id, 'degrade_mode_switch', runtime.retryCount + 1, { label, to: 'reference', role });
        entries.push({
          label,
          content: this.toReferenceText(source, raw),
          mode: 'reference',
          preservePriority,
          source,
          role,
        });
      }
    }

    let totalTokens = entries.reduce((sum, e) => sum + estimateTokens(e.content), 0);
    while (totalTokens > INPUT_TOTAL_LIMIT_TOKENS) {
      const candidateIdx = pickEntryIndexToDegrade(
        entries.map((e) => ({
          mode: e.mode,
          preservePriority: e.preservePriority,
          tokenCount: estimateTokens(e.content),
        })),
      );
      if (candidateIdx < 0) {
        this.postMessage({
          type: 'stageError',
          stageId: stage.id,
          error: `输入上下文过长：估算 ${totalTokens} tokens，超过 ${INPUT_TOTAL_LIMIT_TOKENS}`,
          errorType: 'llm-context-overflow',
        });
        throw new Error('llm-context-overflow');
      }

      const candidate = entries[candidateIdx];
      if (candidate.mode === 'full') {
        const summarized = await this.summarizeForInput(stage.id, candidate.label, candidate.content);
        entries[candidateIdx] = { ...candidate, content: summarized, mode: 'summary' };
      } else {
        const refContent = candidate.source
          ? this.toReferenceText(candidate.source, candidate.content)
          : `[reference]\nlabel=${candidate.label}\npreview=${candidate.content.slice(0, 200).replace(/\s+/g, ' ').trim()}`;
        entries[candidateIdx] = { ...candidate, content: refContent, mode: 'reference' };
        this.warn(`input-degrade-summary-to-reference stage=${stage.id} label=${candidate.label}`);
        this.debugLog(stage.id, 'degrade_mode_switch', runtime.retryCount + 1, {
          label: candidate.label,
          from: 'summary',
          to: 'reference',
        });
      }
      totalTokens = entries.reduce((sum, e) => sum + estimateTokens(e.content), 0);
    }

    switch (stage.input.mergeStrategy) {
      case 'template': {
        let template = stage.input.mergeTemplate ?? '';
        for (const e of entries) {
          template = template.split(`{{${e.label}}}`).join(e.content);
        }
        const unmatched = Array.from(template.matchAll(/\{\{([^}]+)\}\}/g)).map((m) => m[1].trim());
        if (unmatched.length > 0) {
          this.warn(
            `template 未命中占位符，stage=${stage.id}, unmatched=${Array.from(new Set(unmatched)).join(', ')}`,
          );
          template += `\n\n[未替换占位符: ${Array.from(new Set(unmatched)).join(', ')}]`;
        }
        return template || entries.map((e) => e.content).join('\n\n');
      }
      case 'object': {
        const obj: Record<string, string> = {};
        for (const e of entries) {
          obj[e.label] = e.content;
        }
        return JSON.stringify(obj);
      }
      case 'concat':
      default:
        return entries.map((e) => e.content).join('\n\n');
    }
  }

  async executeNextStage(): Promise<void> {
    if (!this.instance) {
      return;
    }
    this.beginExecutionDepth();
    try {
      const parallelMonitor = new WorkflowParallelMonitor();
      await executeNextStageLoop({
      instance: this.instance,
      panel: undefined,
      currentInstanceKey: this.currentInstanceKey,
      setCurrentInstanceKey: (instanceKey) => {
        this.currentInstanceKey = instanceKey;
      },
      evaluateSkipCondition,
      postMessage: (_p, msg) => this.postMessage(msg),
      scheduleSave: () => this.scheduleSave(),
      debugLog: (stageId, event, attempt, payload) => this.debugLog(stageId, event, attempt, payload),
      debugLogLlmPreview: (stageId, attempt, preview) => {
        if (this.isDebugVerbose()) {
          this.debugLog(stageId, 'llm_output_preview', attempt, preview);
        }
      },
      primaryOutputKey: (stage) => this.primaryOutputKey(stage),
      ensureTaskDir: (instanceKey) => {
        this.ensureTaskDir(instanceKey);
      },
      resolveInput: (stage, runtime, _p) => this.resolveInput(stage, runtime),
      executeLlmText: (stageId, sys, user, _p) => {
        const stage = this.instance!.definition.stages.find((s) => s.id === stageId);
        const runtime = this.instance!.stageRuntimes.find((r) => r.stageId === stageId);
        const augmented =
          stage && runtime ? this.augmentSystemPromptWithGlobalDecisions(stage, runtime, sys) : sys;
        return this.executeLlmText(stageId, augmented, user);
      },
      applyPatchInstructions: (instanceKey, instructions, runtime, outKey, pathBase) =>
        this.applyPatchInstructions(instanceKey, instructions, runtime, outKey, pathBase),
      resolveTaskFilePath: (instanceKey, relativePath) => this.resolveTaskFilePath(instanceKey, relativePath),
      resolveOutputPath: (instanceKey, relativePath, base) =>
        this.resolveOutputPath(instanceKey, relativePath, base ?? DEFAULT_TOOL_PATH_BASE),
      resolveReadableFilePath: (instanceKey, relativePath) =>
        this.resolveReadableFilePath(instanceKey, relativePath),
      runCodeRunner: (cfg, instanceKey, stageId) => this.runCodeRunner(cfg, instanceKey, stageId),
      isCancellationError: (error) =>
        error instanceof Error &&
        (error.name === 'AbortError' || error.name === 'Canceled' || error.name === 'CancellationError'),
      enableDagScheduler: this.instance.definition.globalConfig?.enableDagScheduler === true,
      dagMaxParallelism: this.resolveDagMaxParallelismForInstance(),
      // M14.3 I-22：将 user_action 追溯回调下沉到 executor，确保 skip / 流式 / 错误等关键事件均有记录
      logUserAction: (kind, detail) => this.logUserAction(kind, detail),
      trackPersistedFile: (input) => this.trackPersistedFile(input),
      confidencePauseThreshold: readConfidencePauseThreshold(this.platform.config),
      hitlPolicy: buildHITLPolicy({
        confidencePauseThreshold: readConfidencePauseThreshold(this.platform.config),
        contractNodePauseThreshold: readContractNodePauseThreshold(this.platform.config),
        pauseContractNodesBelowThreshold: readPauseContractNodesEnabled(this.platform.config),
      }),
      onDagParallelWaveStart: (stageIds) => parallelMonitor.recordWaveStart(stageIds),
      onDagParallelWaveComplete: (waveIndex) => {
        parallelMonitor.recordWaveComplete(waveIndex);
        return parallelMonitor.buildWaveDebugPayload(waveIndex);
      },
      postImplStaticAnalysis: readStaticAnalysisEnabled(this.platform.config)
        ? async (_stage) => {
            const ws = this.getWorkspaceRootAbsolute();
            if (!ws) {
              return [];
            }
            const checks = buildDefaultWorkspaceChecks(ws);
            if (checks.length === 0) {
              return [];
            }
            const results = await runStaticAnalysis(checks, ws);
            return analysisResultsToWarningLines(results);
          }
        : undefined,
      preRunEndContractLint: async () => this.runWorkspaceContractLint(),
    });
    } finally {
      this.endExecutionDepth();
    }
  }

  private async executeLlmText(
    stageId: string,
    systemPrompt: string,
    userContent: string,
  ): Promise<string> {
    const idleMs = readLlmTimeoutMs(this.platform.config);
    const ac = new AbortController();
    // 空闲超时：只要流持续吐字就不取消，仅连续 idleMs 无新增量才判定卡死。
    const idle = createIdleTimeout(idleMs, () => ac.abort());
    const onActivity = (): void => idle.reset();
    try {
      const apiKey = this.platform.config.get<string>('llmApiKey', '').trim();
      if (this.preferredModelFamily?.startsWith('direct:') && !apiKey) {
        throw new Error('已选择「直接 API」模型但未配置 stagent.llmApiKey');
      }
      const stage = this.instance?.definition.stages.find((s) => s.id === stageId);
      // 能力路由（#2）：决策阶段 / 声明 JSON 输出的阶段强制走结构化可靠模型，
      // 避免下发到浏览器自动化网页 AI（structuredOutput===false）。
      const requireStructured =
        !!stage &&
        (stage.isDecisionStage === true ||
          (stage.outputs?.some((o) => o.format === 'json') ?? false));
      const models = requireStructured
        ? await this.selectStructuredModels()
        : await this.selectPreferredModels();
      if (models.length === 0) {
        throw new Error('未配置 GitHub Copilot 语言模型且无 stagent.llmApiKey，无法执行 LLM 阶段');
      }
      const overrides = this.platform.config.get<Record<string, string>>('agentRoleOverrides', {});
      const agentConfig = buildAgentSelectionConfig(overrides);
      const model =
        stage && models.length > 1
          ? pickModelForStage(stage, agentConfig, models) ?? models[0]
          : models[0];
      const channel = this.llmChannel(model);
      const prompt = `系统指令：\n${systemPrompt}\n\n用户输入：\n${userContent}`;
      // onActivity：透传空闲计时器 reset，使推理模型作答前的思维链
      // （reasoning_content）流量也算「存活」，避免长思考被空闲超时误杀。
      const sendOptions: LlmSendOptions = { onActivity };
      const full = await this.consumeLlmStream(
        model.sendRequest([{ role: 'user', content: prompt }], sendOptions, ac.signal),
        channel,
        stageId,
        false,
        onActivity,
      );
      if (looksLikeRefusal(full)) {
        const retryPrompt = `${prompt}\n\n补充要求：请继续完成任务本身；若信息不足，请提出可执行假设并输出结构化内容，禁止仅返回拒绝句。`;
        const retried = await this.consumeLlmStream(
          model.sendRequest([{ role: 'user', content: retryPrompt }], sendOptions, ac.signal),
          channel,
          stageId,
          true,
          onActivity,
        );
        if (!looksLikeRefusal(retried) && retried.trim().length > 0) {
          return retried;
        }
      }
      return full;
    } catch (e) {
      throw new Error(formatLlmUserFacingError(e, idleMs));
    } finally {
      idle.clear();
    }
  }

  private async selectPreferredModels(): Promise<LlmModel[]> {
    return this.platform.llm.listModels({ family: this.preferredModelFamily });
  }

  /**
   * 能力路由（#2）：为 JSON / 决策等结构化阶段挑选「可靠产出结构化输出」的模型。
   * 仅当首选模型 `structuredOutput === false`（如浏览器自动化网页 AI）时才覆盖，
   * 改用链路中结构化可靠的模型；否则保持 selectPreferredModels 原行为（VS Code 不受影响）。
   */
  private async selectStructuredModels(): Promise<LlmModel[]> {
    const preferred = await this.selectPreferredModels();
    if (preferred.length === 0 || preferred[0].structuredOutput !== false) {
      return preferred;
    }
    const capable = (await this.platform.llm.listModels()).filter(
      (m) => m.structuredOutput !== false,
    );
    return capable.length > 0 ? capable : preferred;
  }

  /**
   * JSON 修复回路（#1）：要求结构化模型产出 JSON 对象，解析失败时有界重试修复。
   * 浏览器 AI 包 markdown / 加解释 / 截断时，由 buildJsonRepairPrompt 追问纠正。
   * 返回解析后的对象；最终仍失败返回 undefined（调用方决定降级行为）。
   */
  private async invokeLlmJsonObject(
    systemPrompt: string,
    userContent: string,
    traceStageId: string,
    maxRepairAttempts = 2,
  ): Promise<Record<string, unknown> | undefined> {
    let raw = await this.invokeLlmRaw(systemPrompt, userContent, traceStageId, {
      requireStructured: true,
      jsonMode: true,
    });
    for (let attempt = 0; attempt <= maxRepairAttempts; attempt += 1) {
      const jsonStr = extractJsonObject(raw);
      if (jsonStr) {
        try {
          const parsed = JSON.parse(jsonStr) as unknown;
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
          }
        } catch {
          /* 落入下方修复重试 */
        }
      }
      if (attempt === maxRepairAttempts) {
        break;
      }
      // #1 进阶：截断 → 续写并拼接；其它格式错误 → 重写。
      if (isLikelyTruncatedJson(raw)) {
        // 续写产出的是「尾部片段」而非完整对象，故不开 jsonMode（否则会被强制成完整 JSON）。
        const continuation = await this.invokeLlmRaw(
          buildJsonContinuationPrompt(raw),
          '',
          `${traceStageId}-continue`,
          { requireStructured: true },
        );
        raw = raw + continuation;
      } else {
        raw = await this.invokeLlmRaw(buildJsonRepairPrompt(raw), raw, `${traceStageId}-repair`, {
          requireStructured: true,
          jsonMode: true,
        });
      }
    }
    return undefined;
  }

  getPreferredModelFamily(): string {
    return this.preferredModelFamily;
  }

  setPreferredModelFamily(modelFamily: string): void {
    this.preferredModelFamily = modelFamily;
    this.platform.state.set(PREFERRED_LM_STATE_KEY, modelFamily);
  }

  /** 供侧栏展示：当前绑定实例的阶段摘要（无实例或未加载时返回 null） */
  getCurrentStageInfo():
    | {
        instanceTitle: string;
        stageId: string;
        stageName: string;
        stageIndex: number;
        stageTotal: number;
        status: string;
      }
    | undefined {
    const inst = this.instance;
    if (!inst) {
      return;
    }
    const running = inst.stageRuntimes.find((r) => r.status === 'running' || r.status === 'paused');
    if (!running) {
      const lastDone = [...inst.stageRuntimes].reverse().find((r) => r.status === 'done');
      if (!lastDone) {
        return undefined;
      }
      const stageIdx = inst.definition.stages.findIndex((s) => s.id === lastDone.stageId);
      const stage = inst.definition.stages[stageIdx];
      return {
        instanceTitle: inst.definition.meta.title,
        stageId: lastDone.stageId,
        stageName: stage?.title ?? lastDone.stageId,
        stageIndex: stageIdx + 1,
        stageTotal: inst.definition.stages.length,
        status: inst.status,
      };
    }
    const stageIdx = inst.definition.stages.findIndex((s) => s.id === running.stageId);
    const stage = inst.definition.stages[stageIdx];
    return {
      instanceTitle: inst.definition.meta.title,
      stageId: running.stageId,
      stageName: stage?.title ?? running.stageId,
      stageIndex: stageIdx + 1,
      stageTotal: inst.definition.stages.length,
      status: running.status,
    };
  }

  /**
   * 供宿主「AI 复核」按钮：返回某决策阶段的复核上下文（任务/阶段语义 + 已批准的上游决策摘要），
   * 让复核 prompt 能贴着「这个阶段在决定什么」来挑刺，而非泛泛而谈。无实例/无该阶段时返回 undefined。
   */
  getDecisionReviewContext(stageId: string):
    | {
        instanceTitle: string;
        taskType?: string;
        userInput?: string;
        stageTitle: string;
        stageDescription?: string;
        upstreamDecisions: { stageId: string; summary: string }[];
      }
    | undefined {
    const inst = this.instance;
    if (!inst) {
      return undefined;
    }
    const stageIdx = inst.definition.stages.findIndex((s) => s.id === stageId);
    if (stageIdx < 0) {
      return undefined;
    }
    const stage = inst.definition.stages[stageIdx];
    const upstreamDecisions: { stageId: string; summary: string }[] = [];
    for (let i = 0; i < stageIdx; i++) {
      const rt = inst.stageRuntimes[i];
      const record = (rt as { decisionRecord?: string }).decisionRecord;
      if (typeof record === 'string' && record.trim()) {
        upstreamDecisions.push({
          stageId: rt.stageId,
          summary: record.trim().slice(0, 280),
        });
      }
    }
    return {
      instanceTitle: inst.definition.meta.title,
      taskType: inst.definition.meta.taskType,
      userInput: inst.definition.meta.userInput,
      stageTitle: stage.title,
      stageDescription: stage.description,
      upstreamDecisions,
    };
  }

  async approve(stageId: string): Promise<void> {
    if (!this.instance) {
      return;
    }
    const idx = this.instance.definition.stages.findIndex((s) => s.id === stageId);
    if (idx < 0 || idx !== this.instance.currentStageIndex) {
      return;
    }
    const stage = this.instance.definition.stages[idx];
    const rt = this.instance.stageRuntimes[idx];
    if (rt.status !== 'paused') {
      return;
    }

    // === M14.2 I-20：普通 approve 不允许作用于决策阶段（防伪造消息绕过决策闸门）===
    if (!isPlainApproveAllowedForStage(stage)) {
      this.logUserAction('approve_rejected_decision_stage', { stageId });
      this.postMessage({
        type: 'stageError',
        stageId,
        error: `I-20: 决策阶段不允许通过普通 approve 推进，请使用「批准决策」按钮提交 decisionRecord。`,
        errorType: 'invariant-violation',
      });
      return;
    }

    if (blocksDirectApproveForQuestionAfter(stage)) {
      this.warn(`I-追问: 阶段 ${stageId} 含 questionAfter，必须通过 Webview 提交答案（answerQuestions），禁止直接 approve`);
      return;
    }
    this.logUserAction('approve', { stageId });
    this.markStageArtifactsApproved(stageId);
    markApproved(rt, new Date().toISOString());
    emitStageDoneAdvancePersist({
      emit: (msg) => this.postMessage(msg),
      stageId,
      decisionUiFlag: 'omit',
      bumpStageIndex: () => {
        this.instance!.currentStageIndex++;
      },
      scheduleSave: () => this.scheduleSave(),
    });
    await this.executeNextStage();
  }

  async approveDecision(stageId: string, decisionRecord: string): Promise<void> {
    if (!this.instance) {
      return;
    }
    const idx = this.instance.definition.stages.findIndex((s) => s.id === stageId);
    if (idx < 0 || idx !== this.instance.currentStageIndex) {
      this.warn(`I-3: approveDecision 目标阶段非法 stageId=${stageId}`);
      return;
    }
    const stage = this.instance.definition.stages[idx];
    const rt = this.instance.stageRuntimes[idx];
    if (stage.isDecisionStage !== true || rt.status !== 'paused') {
      this.warn(`I-3: approveDecision 仅允许 paused 且 isDecisionStage=true，当前 stage=${stageId}`);
      return;
    }

    // === M13.1：决策清单内容级 HARD 校验（灰度开关控制；对应 SPEC §4.4 / §9.1 I-17 ~ I-19）===
    const lintGate = evaluateDecisionContentLintGate(
      this.instance.definition.globalConfig,
      decisionRecord,
      { vscodeDefault: this.isDecisionContentLintVscodeDefault() },
    );
    if (lintGate.outcome === 'reject') {
      this.logUserAction('approve_decision_rejected', {
        stageId,
        violationCodes: lintGate.violationCodes,
      });
      this.postMessage({
        type: 'stageError',
        stageId,
        error: `决策清单内容校验失败：${lintGate.rejectionSummary}。请在审核器中补全后再批准。`,
        errorType: 'invariant-violation',
      });
      return;
    }

    this.logUserAction('approve_decision', { stageId, decisionChars: decisionRecord.length });
    markDecisionApproved(
      stage,
      rt,
      decisionRecord,
      String(rt.outputs[this.primaryOutputKey(stage)] ?? ''),
      new Date().toISOString(),
    );

    // === M14.1 I-7 post-condition：approveDecision 必须将决策清单写入 runtime.outputs['decisionRecord'] ===
    // 主路径由 markDecisionApproved（WorkflowStateTransitions.ts）完成；本断言用于防御未来重构破坏不变式。
    if (!Object.prototype.hasOwnProperty.call(rt.outputs, 'decisionRecord')) {
      this.warn(`I-7 防御性补写：approveDecision 后 outputs.decisionRecord 缺失 stageId=${stageId}`);
      rt.outputs.decisionRecord = decisionRecord;
    }

    emitStageDoneAdvancePersist({
      emit: (msg) => this.postMessage(msg),
      stageId,
      decisionUiFlag: true,
      bumpStageIndex: () => {
        this.instance!.currentStageIndex++;
      },
      scheduleSave: () => this.scheduleSave(),
    });
    await this.executeNextStage();
  }

  async answerQuestions(
    stageId: string,
    answers: Record<string, string>,
  ): Promise<void> {
    if (!this.instance) {
      return;
    }
    const idx = this.instance.definition.stages.findIndex((s) => s.id === stageId);
    if (idx < 0) {
      return;
    }
    const stage = this.instance.definition.stages[idx];
    const rt = this.instance.stageRuntimes[idx];
    if (!shouldAutoAdvanceAfterAnswers(stage, rt, this.instance.currentStageIndex, idx)) {
      return;
    }

    // === M14.1 I-8（questionAfter 路径）：required=true 答案为空时拒绝，不推进 ===
    const requiredCheck = validateRequiredAnswers(stage.questionAfter, answers);
    if (!requiredCheck.ok) {
      this.logUserAction('answer_questions_after_rejected', {
        stageId,
        missingIds: requiredCheck.missingIds,
      });
      this.postMessage({
        type: 'stageError',
        stageId,
        error: `I-8: 必答问题答案为空：${requiredCheck.missingIds.join('、')}。请补全后重新提交。`,
        errorType: 'invariant-violation',
      });
      return;
    }

    this.logUserAction('answer_questions_after', { stageId, answerKeys: Object.keys(answers) });
    applyQuestionAfterAnswers(rt, answers, new Date().toISOString());
    emitStageDoneAdvancePersist({
      emit: (msg) => this.postMessage(msg),
      stageId,
      decisionUiFlag: !!stage.isDecisionStage,
      bumpStageIndex: () => {
        this.instance!.currentStageIndex++;
      },
      scheduleSave: () => this.scheduleSave(),
    });
    await this.executeNextStage();
  }

  async answerQuestionsBefore(
    stageId: string,
    answers: Record<string, string>,
  ): Promise<void> {
    if (!this.instance) {
      return;
    }
    const idx = this.instance.definition.stages.findIndex((s) => s.id === stageId);
    if (idx < 0) {
      return;
    }
    const stage = this.instance.definition.stages[idx];
    const rt = this.instance.stageRuntimes[idx];

    // === M14.1 I-8（questionBefore 路径）：required=true 答案为空时拒绝，不推进 ===
    const requiredCheck = validateRequiredAnswers(stage.questionBefore, answers);
    if (!requiredCheck.ok) {
      this.logUserAction('answer_questions_before_rejected', {
        stageId,
        missingIds: requiredCheck.missingIds,
      });
      this.postMessage({
        type: 'stageError',
        stageId,
        error: `I-8: 必答问题答案为空：${requiredCheck.missingIds.join('、')}。请补全后重新提交。`,
        errorType: 'invariant-violation',
      });
      return;
    }

    this.logUserAction('answer_questions_before', { stageId, answerKeys: Object.keys(answers) });
    applyQuestionBeforeAnswers(rt, answers);
    if (this.instance.currentStageIndex !== idx) {
      this.instance.currentStageIndex = idx;
    }
    this.scheduleSave();
    await this.executeNextStage();
  }

  async retry(stageId: string, comment: string): Promise<void> {
    if (!this.instance) {
      return;
    }
    const idx = this.instance.definition.stages.findIndex((s) => s.id === stageId);
    if (idx < 0) {
      return;
    }

    const stage = this.instance.definition.stages[idx];
    const rt = this.instance.stageRuntimes[idx];
    const maxManualStageRetries = this.getMaxManualStageRetries();
    const limit = evaluateManualRetryLimit(rt.retryCount, maxManualStageRetries);
    if (!limit.allowed) {
      this.logUserAction('retry_rejected', {
        stageId,
        retryCount: rt.retryCount,
        maxManualStageRetries,
        reason: 'retry-limit-exceeded',
      });
      this.postMessage({
        type: 'stageError',
        stageId,
        error: limit.message,
        errorType: 'retry-limit-exceeded',
      });
      return;
    }

    this.logUserAction('retry', { stageId, commentChars: comment.length });
    this.debugLog(stageId, 'retry_trigger', rt.retryCount + 1, {
      reason: comment || '(empty-comment)',
      isDecisionStage: !!stage.isDecisionStage,
    });
    applyRetryBase(rt, comment);

    if (stage.isDecisionStage) {
      // M2.2: 决策阶段级联重置（I-9）+ M15.4 磁盘回滚
      let rolledBackFiles: string[] | undefined;
      const artifactMgr = this.instance.artifactRegistry
        ? new ArtifactLifecycleManager(this.instance.artifactRegistry)
        : undefined;
      if (artifactMgr) {
        const toRollback = artifactMgr.getArtifactsForDecisionRetry(
          this.instance.definition,
          this.instance,
          stageId,
          idx,
        );
        if (toRollback.length > 0) {
          const rollbackResult = await artifactMgr.rollbackArtifacts(toRollback);
          this.debugLog(stageId, 'artifact_rollback', rt.retryCount, {
            count: toRollback.length,
            rolledBack: rollbackResult.rolledBack,
            failed: rollbackResult.failed,
          });
          if (!rollbackResult.ok) {
            const detail = rollbackResult.failed.map((f) => `${f.filePath}: ${f.error}`).join('；');
            this.warn(`artifact rollback failed: ${detail}`);
            this.postMessage({
              type: 'stageError',
              stageId,
              error: `决策重试磁盘回滚失败：${detail}`,
              errorType: 'invariant-violation',
            });
            return;
          }
          rolledBackFiles = rollbackResult.rolledBack;
        }
      }

      applyRetryForDecisionCurrent(rt);
      const { resetStageIds, resetStageTitles } = collectDecisionRetryResets(
        this.instance.definition,
        this.instance,
        stageId,
        idx,
      );

      for (const sid of resetStageIds) {
        const sidx = this.instance.definition.stages.findIndex((s) => s.id === sid);
        if (sidx >= 0 && this.instance.stageRuntimes[sidx].status !== 'pending') {
          this.error(`I-9 违反：阶段 ${sid} 未被重置到 pending`);
        }
      }

      this.postMessage({
        type: 'downstreamReset',
        decisionStageId: stageId,
        resetStageIds,
        resetStageTitles,
        rolledBackFiles,
      });

      if (this.instance.status === 'completed') {
        this.instance.status = 'running';
      }
    } else {
      applyRetryForNonDecision(rt);
    }
    this.instance.currentStageIndex = idx;
    this.instance.status = 'running';
    this.scheduleSave();
    await this.executeNextStage();
  }

  async openArtifactFile(stageId: string, filePath: string): Promise<void> {
    if (!this.instance || !this.currentInstanceKey) {
      return;
    }
    const stage = this.instance.definition.stages.find((s) => s.id === stageId);
    if (!stage || stage.isDecisionStage) {
      void this.platform.notify.warn('Stagent：决策阶段不支持生成物文件审查。');
      return;
    }
    const absPath = resolveStageArtifactAbsPath(
      stage,
      filePath,
      this.instance.artifactRegistry,
      (relativePath, base) => this.resolveOutputPath(this.currentInstanceKey!, relativePath, base ?? DEFAULT_TOOL_PATH_BASE),
    );
    if (!fs.existsSync(absPath)) {
      void this.platform.notify.warn(`Stagent：文件不存在 — ${absPath}`);
      return;
    }
    await this.platform.editor.openFile(absPath);
  }

  async openArtifactDiff(stageId: string, filePath: string): Promise<void> {
    if (!this.instance || !this.currentInstanceKey) {
      return;
    }
    const stage = this.instance.definition.stages.find((s) => s.id === stageId);
    if (!stage || stage.isDecisionStage) {
      void this.platform.notify.warn('Stagent：决策阶段不支持生成物 diff。');
      return;
    }
    const absPath = resolveStageArtifactAbsPath(
      stage,
      filePath,
      this.instance.artifactRegistry,
      (relativePath, base) => this.resolveOutputPath(this.currentInstanceKey!, relativePath, base ?? DEFAULT_TOOL_PATH_BASE),
    );
    const art = findStageArtifact(this.instance.artifactRegistry, stageId, absPath);
    const canDiff = !!(art?.existedBefore && art.priorContent !== undefined);
    if (!canDiff) {
      void this.platform.notify.info('Stagent：该文件为新建或无 prior 版本，将直接打开当前文件。');
      await this.openArtifactFile(stageId, filePath);
      return;
    }
    const prior = art!.priorContent ?? '';
    const current = fs.existsSync(absPath) ? fs.readFileSync(absPath, 'utf-8') : '';
    const ext = path.extname(absPath).slice(1);
    const title = `${path.basename(absPath)} (回滚前 ↔ 当前)`;
    await this.platform.editor.openDiff({ content: prior, ext }, { content: current, ext }, title);
  }

  async copyRecentDebugLog(): Promise<void> {
    if (!this.instance || !this.currentInstanceKey) {
      await this.platform.notify.warn('Stagent：当前没有可复制的调试实例。');
      return;
    }
    const debugPath = path.join(this.ensureTaskDir(this.currentInstanceKey), '.wf-debug.log');
    const raw = fs.existsSync(debugPath) ? fs.readFileSync(debugPath, 'utf-8') : undefined;
    const result = buildDebugLogCopyResult(raw);
    if (!result.ok) {
      await this.platform.notify.warn('Stagent：未找到调试日志文件。');
      return;
    }
    await this.platform.shell.copyText(result.content);
    await this.platform.notify.info('Stagent：完整调试日志已复制到剪贴板。');
  }

  /**
   * 复制「会话级」调试日志（globalStorageDir/.session-debug.log）：覆盖执行前的
   * polish/clarify/generate 的 LLM 调用与错误。与 copyRecentDebugLog 互补——
   * 后者是某个任务实例的执行阶段日志，本方法是跨任务、跨阶段的会话日志。
   */
  async copyRecentSessionLog(): Promise<void> {
    const sessionPath = sessionDebugLogPath(this.platform.paths.globalStorageDir());
    const raw = fs.existsSync(sessionPath) ? fs.readFileSync(sessionPath, 'utf-8') : undefined;
    const result = buildDebugLogCopyResult(raw);
    if (!result.ok) {
      await this.platform.notify.warn('Stagent：暂无会话日志（尚未发生执行前的模型调用）。');
      return;
    }
    await this.platform.shell.copyText(result.content);
    await this.platform.notify.info('Stagent：会话日志已复制到剪贴板。');
  }

  editOutput(stageId: string, outputKey: string, newContent: unknown): void {
    if (!this.instance) {
      return;
    }
    const idx = this.instance.definition.stages.findIndex((s) => s.id === stageId);
    if (idx < 0) {
      return;
    }
    this.instance.stageRuntimes[idx].outputs[outputKey] = newContent;
    this.logUserAction('edit_output', { stageId, outputKey });
    this.scheduleSave();
  }
}

export function isFrontendMessage(msg: unknown): msg is FrontendMessage {
  return typeof msg === 'object' && msg !== null && 'type' in msg;
}
