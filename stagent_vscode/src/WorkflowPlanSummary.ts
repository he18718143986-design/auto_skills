import { MAX_STAGES_WARN } from './workflow/WorkflowLimits';
import { PRIMARY_DECISION_OUTPUT_KEY } from './WorkflowOutputKeys';
import { implHasDecisionRecordSourcePlanWide } from './workflow/StageInputSources';
import {
  BUILTIN_WARNING_STAGE_COUNT_EXCEEDS_50,
  BUILTIN_WARNING_STAGE_COUNT_NEAR_LIMIT,
} from './lint/WorkflowWarningTokens';
import { resolveWebviewString } from './webview/l10n/resolveWebviewString';
import { LOG_PREVIEW_USER_SNIPPET } from './LogPreviewLimits';
import { countStagesByKind } from './workflow/StageKindCounts';
import { isImplStageId } from './workflow/StageIdPatterns';
import {
  hasGlobalArchitectureDecisionStageHeuristic,
  shouldRequireGlobalArchitectureDecision,
} from './workflow/globalArchitecturePolicy';
import type { ComplexityEstimate } from './WorkflowComplexityEstimator';
import type { Stage, WorkflowDefinition } from './WorkflowDefinition';

/** @deprecated 使用 `MAX_STAGES_WARN`；与 runtime `stage_count_near_limit` 阈值一致 */
export const PLAN_STAGE_HARD_CAP = MAX_STAGES_WARN;

/** 「临近上限」区间宽度（41–45 当 cap=45） */
export const PLAN_STAGE_NEAR_LIMIT_BAND = 5;

export interface PlanSummary {
  stageCount: number;
  /** 阶段硬上限（随对象传给 webview，避免内联函数引用模块级常量导致 `exports is not defined`）。 */
  stageHardCap: number;
  decisionStageCount: number;
  implStageCount: number;
  testRunStageCount: number;
  stageBudgetPercent: number;
  nearStageLimit: boolean;
  exceedsStageLimit: boolean;
  complexityTier?: string;
  estimatedImplModules?: number;
  dependencyEdgeCount: number;
  missingGlobalArchDecision: boolean;
  rule20ViolationCount: number;
  rule20WarningCount: number;
  implMissingDecisionSourceCount: number;
}

export interface StageSourceEdge {
  stageId: string;
  stageTitle: string;
  sourceType: string;
  refStageId?: string;
  outputKey?: string;
  label?: string;
  rule20D_ok?: boolean;
}

export interface PlanStageDiff {
  added: string[];
  removed: string[];
  unchanged: string[];
}

function countRule20Tokens(warnings: string[] | undefined, prefix: string): number {
  if (!warnings?.length) {
    return 0;
  }
  return warnings.filter((w) => w.startsWith(prefix)).length;
}

function implMissingDecisionRecord(stage: Stage): boolean {
  if (!isImplStageId(stage.id)) {
    return false;
  }
  const sources = stage.input?.sources ?? [];
  return !implHasDecisionRecordSourcePlanWide(sources);
}

export function buildPlanSummary(
  workflow: WorkflowDefinition,
  options?: {
    complexity?: ComplexityEstimate;
    warnings?: string[];
  },
): PlanSummary {
  const stages = workflow.stages ?? [];
  const {
    stageCount,
    decisionCount: decisionStageCount,
    implCount: implStageCount,
    testRunCount: testRunStageCount,
  } = countStagesByKind(stages);
  const missingGlobalArchDecision =
    shouldRequireGlobalArchitectureDecision(workflow) &&
    !hasGlobalArchitectureDecisionStageHeuristic(workflow);

  let dependencyEdgeCount = 0;
  for (const st of stages) {
    for (const src of st.input?.sources ?? []) {
      if (src.type === 'stage-output' && src.stageId) {
        dependencyEdgeCount += 1;
      }
    }
  }

  const implMissingDecisionSourceCount = stages.filter(implMissingDecisionRecord).length;

  return {
    stageCount,
    stageHardCap: MAX_STAGES_WARN,
    decisionStageCount,
    implStageCount,
    testRunStageCount,
    stageBudgetPercent: Math.min(100, Math.round((stageCount / MAX_STAGES_WARN) * 100)),
    nearStageLimit:
      stageCount > MAX_STAGES_WARN - PLAN_STAGE_NEAR_LIMIT_BAND && stageCount <= MAX_STAGES_WARN,
    exceedsStageLimit: stageCount > MAX_STAGES_WARN,
    complexityTier: options?.complexity?.requiresGlobalArchitectureDecision
      ? 'multi-module-likely'
      : options?.complexity?.highHitlLikely
        ? 'hitl-likely'
        : 'standard',
    estimatedImplModules: options?.complexity?.estimatedImplModules,
    dependencyEdgeCount,
    missingGlobalArchDecision,
    rule20ViolationCount: countRule20Tokens(options?.warnings, 'rule20:'),
    rule20WarningCount: countRule20Tokens(options?.warnings, 'rule20-soft:'),
    implMissingDecisionSourceCount,
  };
}

export function buildStageSourceSummary(workflow: WorkflowDefinition): StageSourceEdge[] {
  const edges: StageSourceEdge[] = [];
  for (const st of workflow.stages) {
    const sources = st.input?.sources ?? [];
    if (sources.length === 0) {
      edges.push({
        stageId: st.id,
        stageTitle: st.title,
        sourceType: '(无 input.sources)',
      });
      continue;
    }
    for (const src of sources) {
      const edge: StageSourceEdge = {
        stageId: st.id,
        stageTitle: st.title,
        sourceType: src.type,
        refStageId: src.stageId,
        outputKey: src.outputKey,
        label: src.label,
      };
      if (
        isImplStageId(st.id) &&
        src.type === 'stage-output' &&
        src.outputKey === PRIMARY_DECISION_OUTPUT_KEY
      ) {
        edge.rule20D_ok = true;
      }
      edges.push(edge);
    }
    if (
      isImplStageId(st.id) &&
      !implHasDecisionRecordSourcePlanWide(sources)
    ) {
      edges.push({
        stageId: st.id,
        stageTitle: st.title,
        sourceType: '⚠ Rule20-D',
        label: resolveWebviewString('stagent.webview.plan.missingDecisionRecord'),
        rule20D_ok: false,
      });
    }
  }
  return edges;
}

export function formatPlanSummaryLines(summary: PlanSummary): string[] {
  const lines: string[] = [resolveWebviewString('stagent.webview.plan.summaryHeader')];
  lines.push(
    resolveWebviewString(
      'stagent.webview.plan.stageCountLine',
      summary.stageCount,
      summary.stageHardCap,
      summary.stageBudgetPercent,
    ),
  );
  lines.push(
    resolveWebviewString(
      'stagent.webview.plan.stageKindLine',
      summary.decisionStageCount,
      summary.implStageCount,
      summary.testRunStageCount,
    ),
  );
  if (summary.estimatedImplModules !== undefined) {
    lines.push(resolveWebviewString('stagent.webview.plan.estimatedModules', summary.estimatedImplModules));
  }
  lines.push(resolveWebviewString('stagent.webview.plan.dependencyEdges', summary.dependencyEdgeCount));
  if (summary.complexityTier) {
    lines.push(resolveWebviewString('stagent.webview.plan.complexityTier', summary.complexityTier));
  }
  if (summary.exceedsStageLimit) {
    lines.push(resolveWebviewString('stagent.webview.plan.stageHardCap'));
  } else if (summary.nearStageLimit) {
    lines.push(resolveWebviewString('stagent.webview.plan.stageNearCap'));
  }
  if (summary.missingGlobalArchDecision) {
    lines.push(resolveWebviewString('stagent.webview.plan.multiModuleNoArch'));
  }
  if (summary.implMissingDecisionSourceCount > 0) {
    lines.push(
      resolveWebviewString('stagent.webview.plan.implMissingDecision', summary.implMissingDecisionSourceCount),
    );
  }
  if (summary.rule20ViolationCount > 0) {
    lines.push(resolveWebviewString('stagent.webview.plan.rule20Violations', summary.rule20ViolationCount));
  }
  if (summary.rule20WarningCount > 0) {
    lines.push(resolveWebviewString('stagent.webview.plan.rule20Warnings', summary.rule20WarningCount));
  }
  return lines;
}

export function formatStageSourceSummaryLines(edges: StageSourceEdge[], stageId?: string): string[] {
  const filtered = stageId ? edges.filter((e) => e.stageId === stageId) : edges;
  if (filtered.length === 0) {
    return [resolveWebviewString('stagent.webview.plan.noInputSourcesRef')];
  }
  const lines: string[] = [resolveWebviewString('stagent.webview.plan.inputSourcesHeader')];
  for (const e of filtered) {
    if (e.sourceType === '(无 input.sources)' || e.sourceType === '⚠ Rule20-D') {
      lines.push(`${e.stageId}: ${e.label ?? e.sourceType}`);
      continue;
    }
    const ref = e.refStageId
      ? `${e.refStageId}${e.outputKey ? `#${e.outputKey}` : ''}`
      : e.label ?? e.sourceType;
    const mark = e.rule20D_ok === false ? ' ⚠' : e.rule20D_ok ? ' ✓' : '';
    lines.push(`${e.stageId} ← ${e.sourceType}: ${ref}${mark}`);
  }
  return lines;
}

export function computePlanStageDiff(previousIds: string[], nextIds: string[]): PlanStageDiff {
  const prev = new Set(previousIds);
  const next = new Set(nextIds);
  const added = nextIds.filter((id) => !prev.has(id));
  const removed = previousIds.filter((id) => !next.has(id));
  const unchanged = nextIds.filter((id) => prev.has(id));
  return { added, removed, unchanged };
}

export function formatPlanStageDiffLines(diff: PlanStageDiff, hadPreviousPlan: boolean): string[] {
  if (!hadPreviousPlan) {
    return [];
  }
  const lines: string[] = [resolveWebviewString('stagent.webview.plan.diffHeader')];
  if (diff.added.length) {
    lines.push(resolveWebviewString('stagent.webview.plan.diffAdded', diff.added.length, diff.added.join(', ')));
  }
  if (diff.removed.length) {
    lines.push(resolveWebviewString('stagent.webview.plan.diffRemoved', diff.removed.length, diff.removed.join(', ')));
  }
  if (!diff.added.length && !diff.removed.length) {
    lines.push(resolveWebviewString('stagent.webview.plan.diffSame'));
  }
  return lines;
}

export function isFirstDecisionStage(workflow: WorkflowDefinition, stageId: string): boolean {
  const first = workflow.stages.find((s) => s.isDecisionStage);
  return !!first && first.id === stageId;
}

export function shouldShowPlanReviewChecklist(
  workflow: WorkflowDefinition,
  stageId: string,
  warnings: string[] | undefined,
  planSummary?: PlanSummary,
): boolean {
  if (!isFirstDecisionStage(workflow, stageId)) {
    return false;
  }
  const w = warnings ?? [];
  if (
    w.some(
      (line) =>
        line.includes('software-missing-global-architecture-decision') ||
        line.includes(BUILTIN_WARNING_STAGE_COUNT_EXCEEDS_50) ||
        line.includes(BUILTIN_WARNING_STAGE_COUNT_NEAR_LIMIT) ||
        line.includes('complexity:requires-global-architecture-decision'),
    )
  ) {
    return true;
  }
  if (planSummary?.missingGlobalArchDecision || planSummary?.exceedsStageLimit || planSummary?.nearStageLimit) {
    return true;
  }
  return false;
}

export function buildPlanReviewChecklistLines(
  workflow: WorkflowDefinition,
  planSummary?: PlanSummary,
  warnings?: string[],
): string[] {
  const lines: string[] = [resolveWebviewString('stagent.webview.plan.reviewHeader')];
  const userSnippet = (workflow.meta?.userInput ?? '').trim().slice(0, LOG_PREVIEW_USER_SNIPPET);
  if (userSnippet) {
    lines.push(
      resolveWebviewString(
        'stagent.webview.plan.requirementSnippet',
        userSnippet + ((workflow.meta?.userInput?.length ?? 0) > 200 ? '…' : ''),
      ),
    );
  }
  lines.push(
    resolveWebviewString(
      'stagent.webview.plan.decisionImplCounts',
      planSummary?.decisionStageCount ?? '?',
      planSummary?.implStageCount ?? '?',
    ),
  );
  if (planSummary?.missingGlobalArchDecision) {
    lines.push(resolveWebviewString('stagent.webview.plan.checkMultiModule'));
  }
  if (planSummary?.nearStageLimit || planSummary?.exceedsStageLimit) {
    lines.push(resolveWebviewString('stagent.webview.plan.checkStageBudget'));
  }
  if ((warnings?.length ?? 0) > 0) {
    lines.push(resolveWebviewString('stagent.webview.plan.checkWarnings'));
  }
  lines.push(resolveWebviewString('stagent.webview.plan.checkModuleBoundary'));
  return lines;
}
