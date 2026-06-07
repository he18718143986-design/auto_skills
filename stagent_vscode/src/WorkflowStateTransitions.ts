import type { Stage, StageRuntime, WorkflowDefinition, WorkflowInstance } from './WorkflowDefinition';
import type { StageStatus, WorkflowStatus } from './workflow-types/RuntimeTypes';
import { collectTransitiveConsumerStageIds } from './WorkflowDag';
import { resolveEffectiveEnableDagScheduler } from './EffectiveSettings';
import { resetOutputsForNonDecisionRetry } from './RetryOutputPolicy';
import { collectTddSliceRetryCandidateIds } from './TddSliceScope';
import { PRIMARY_DECISION_OUTPUT_KEY } from './WorkflowOutputKeys';

export type TransitionDomain = 'stage' | 'instance';

export interface TransitionGuardEntry {
  domain: TransitionDomain;
  from: string;
  to: string;
  reason: string;
  legal: boolean;
}

type TransitionLogger = (entry: TransitionGuardEntry) => void;

let transitionLogger: TransitionLogger = () => {};

/** 测试或诊断：订阅状态迁移日志。 */
export function setTransitionLogger(logger: TransitionLogger): void {
  transitionLogger = logger;
}

const LEGAL_STAGE_TRANSITIONS = new Map<StageStatus, ReadonlySet<StageStatus>>([
  ['pending', new Set<StageStatus>(['running', 'waiting-questions', 'skipped', 'done'])],
  ['running', new Set<StageStatus>(['paused', 'done', 'waiting-questions', 'error', 'pending'])],
  ['waiting-questions', new Set<StageStatus>(['pending', 'running'])],
  ['paused', new Set<StageStatus>(['done', 'retrying', 'pending', 'running'])],
  ['retrying', new Set<StageStatus>(['running', 'pending', 'error', 'paused'])],
  ['done', new Set<StageStatus>(['pending', 'retrying', 'paused', 'running'])],
  ['error', new Set<StageStatus>(['pending', 'running', 'retrying'])],
  ['skipped', new Set<StageStatus>(['pending'])],
]);

const LEGAL_INSTANCE_TRANSITIONS = new Map<WorkflowStatus, ReadonlySet<WorkflowStatus>>([
  ['idle', new Set<WorkflowStatus>(['running'])],
  ['running', new Set<WorkflowStatus>(['paused', 'completed', 'failed', 'idle'])],
  ['paused', new Set<WorkflowStatus>(['running', 'failed', 'idle'])],
  ['completed', new Set<WorkflowStatus>(['running', 'failed', 'idle'])],
  ['failed', new Set<WorkflowStatus>(['running', 'idle'])],
]);

function isLegalStageTransition(from: StageStatus, to: StageStatus): boolean {
  if (from === to) {
    return true;
  }
  return LEGAL_STAGE_TRANSITIONS.get(from)?.has(to) ?? false;
}

function isLegalInstanceTransition(from: WorkflowStatus, to: WorkflowStatus): boolean {
  if (from === to) {
    return true;
  }
  return LEGAL_INSTANCE_TRANSITIONS.get(from)?.has(to) ?? false;
}

function logTransition(
  domain: TransitionDomain,
  from: string,
  to: string,
  reason: string,
  legal: boolean,
): void {
  transitionLogger({ domain, from, to, reason, legal });
}

/**
 * HITL / 执行路径的状态迁移 SSOT：校验合法边、记录 reason，再写入 runtime.status。
 */
export function guardedStageTransition(
  runtime: StageRuntime,
  to: StageStatus,
  reason: string,
): void {
  const from = runtime.status;
  const legal = isLegalStageTransition(from, to);
  logTransition('stage', from, to, reason, legal);
  runtime.status = to;
  if (to === 'done' || to === 'skipped') {
    delete runtime.lastError;
    delete runtime.lastFailureSnapshot;
  }
}

/** 实例级 status 迁移 SSOT（如 I-9 失败、决策重试恢复 running）。 */
export function guardedInstanceTransition(
  instance: WorkflowInstance,
  to: WorkflowStatus,
  reason: string,
): void {
  const from = instance.status;
  const legal = isLegalInstanceTransition(from, to);
  logTransition('instance', from, to, reason, legal);
  instance.status = to;
}

export function isAllowedStageTransition(from: StageStatus, to: StageStatus): boolean {
  return isLegalStageTransition(from, to);
}

export function isAllowedInstanceTransition(from: WorkflowStatus, to: WorkflowStatus): boolean {
  return isLegalInstanceTransition(from, to);
}

export function markApproved(runtime: StageRuntime, nowIso: string): void {
  runtime.status = 'done';
  runtime.completedAt = nowIso;
  delete runtime.lastFailureSnapshot;
}

export function markDecisionApproved(
  stage: Stage,
  runtime: StageRuntime,
  decisionRecord: string,
  primaryOutputValue: string,
  nowIso: string,
): string {
  const record = decisionRecord.trim() || primaryOutputValue;
  runtime.outputs[PRIMARY_DECISION_OUTPUT_KEY] = record;
  runtime.approvedDecisionRecord = record;
  runtime.status = 'done';
  runtime.completedAt = nowIso;
  delete runtime.lastFailureSnapshot;
  return record;
}

export function applyQuestionBeforeAnswers(
  runtime: StageRuntime,
  answers: Record<string, string>,
): void {
  runtime.questionBeforeAnswers = { ...runtime.questionBeforeAnswers, ...answers };
  if (runtime.status === 'waiting-questions') {
    runtime.status = 'pending';
  }
}

export function applyRetryBase(runtime: StageRuntime, comment: string): void {
  runtime.retryComment = comment;
  runtime.retryCount += 1;
  runtime.startedAt = undefined;
  runtime.completedAt = undefined;
  delete runtime.lastError;
}

export function applyRetryForNonDecision(runtime: StageRuntime): void {
  runtime.outputs = resetOutputsForNonDecisionRetry(runtime.outputs);
  runtime.status = 'pending';
}

export function listDecisionRetryResetStageIds(
  definition: WorkflowDefinition,
  decisionStageId: string,
  decisionStageIndex: number,
): string[] {
  const resetStageIds: string[] = [];
  const useDagConsumers = resolveEffectiveEnableDagScheduler(definition.globalConfig);
  const dagConsumers = useDagConsumers ? new Set(collectTransitiveConsumerStageIds(definition, decisionStageId)) : null;

  definition.stages.forEach((s, i) => {
    if (i <= decisionStageIndex) {
      return;
    }
    const dependsRecord = s.input.sources.some(
      (src) =>
        src.type === 'stage-output' &&
        src.stageId === decisionStageId &&
        (src.outputKey ?? '') === PRIMARY_DECISION_OUTPUT_KEY,
    );
    const shouldReset = useDagConsumers ? dagConsumers!.has(s.id) : dependsRecord;
    if (shouldReset) {
      resetStageIds.push(s.id);
    }
  });

  return resetStageIds;
}

export function collectDecisionRetryResets(
  definition: WorkflowDefinition,
  instance: WorkflowInstance,
  decisionStageId: string,
  decisionStageIndex: number,
): { resetStageIds: string[]; resetStageTitles: string[] } {
  const resetStageIds: string[] = [];
  const resetStageTitles: string[] = [];

  const ids = listDecisionRetryResetStageIds(definition, decisionStageId, decisionStageIndex);
  for (const sid of ids) {
    const i = definition.stages.findIndex((s) => s.id === sid);
    if (i < 0) {
      continue;
    }
    instance.stageRuntimes[i].status = 'pending';
    instance.stageRuntimes[i].outputs = {};
    instance.stageRuntimes[i].startedAt = undefined;
    instance.stageRuntimes[i].completedAt = undefined;
    delete instance.stageRuntimes[i].lastFailureSnapshot;
    resetStageIds.push(sid);
    resetStageTitles.push(definition.stages[i].title);
  }

  return { resetStageIds, resetStageTitles };
}

export function applyRetryForDecisionCurrent(runtime: StageRuntime): void {
  runtime.approvedDecisionRecord = undefined;
  runtime.outputs[PRIMARY_DECISION_OUTPUT_KEY] = undefined;
  runtime.status = 'retrying';
}

/** 非决策阶段重试：重置 DAG 下游或 TDD 切片内相关阶段（原 retry.ts，现 SSOT 于此）。 */
export function collectNonDecisionRetryResets(
  definition: WorkflowDefinition,
  instance: WorkflowInstance,
  stageId: string,
): { resetStageIds: string[]; resetStageTitles: string[] } {
  const resetStageIds: string[] = [];
  const resetStageTitles: string[] = [];
  const stageIdx = definition.stages.findIndex((s) => s.id === stageId);
  if (stageIdx < 0) {
    return { resetStageIds, resetStageTitles };
  }

  let candidateIds = collectTransitiveConsumerStageIds(definition, stageId);
  if (candidateIds.length === 0) {
    candidateIds = collectTddSliceRetryCandidateIds(
      definition,
      instance.stageRuntimes,
      stageIdx,
    ).filter((id) => id !== stageId);
  }

  const seen = new Set<string>();
  for (const sid of candidateIds) {
    if (seen.has(sid)) {
      continue;
    }
    seen.add(sid);
    const i = definition.stages.findIndex((s) => s.id === sid);
    if (i < 0) {
      continue;
    }
    const rt = instance.stageRuntimes[i]!;
    rt.status = 'pending';
    rt.outputs = {};
    rt.startedAt = undefined;
    rt.completedAt = undefined;
    delete rt.lastError;
    delete rt.lastFailureSnapshot;
    resetStageIds.push(sid);
    resetStageTitles.push(definition.stages[i]!.title);
  }

  return { resetStageIds, resetStageTitles };
}
