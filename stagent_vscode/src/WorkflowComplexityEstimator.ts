import type { CodebaseSnapshot } from './CodebaseContextProvider';
import { COMPLEXITY_DECOMPOSITION_PREVIEW_MAX } from './UiListLimits';
import { userHintsMultiModuleOrFullProject } from './workflow/MultiModuleUserInputHints';
import {
  COMPLEXITY_BASE_STAGES_WITH_ARCH,
  COMPLEXITY_BASE_STAGES_WITHOUT_ARCH,
  COMPLEXITY_EXISTING_MODULES_ARCH_TRIGGER,
  COMPLEXITY_IMPL_THRESHOLD,
  COMPLEXITY_NEAR_STAGE_LIMIT,
  COMPLEXITY_PER_MODULE_STAGES,
  COMPLEXITY_SNAPSHOT_MODULE_CAP,
  COMPLEXITY_SNAPSHOT_MODULES_DIVISOR,
  COMPLEXITY_SUGGESTED_DECOMPOSITION_MAX,
} from './workflow/ComplexityEstimatorConstants';
import { GLOBAL_ARCHITECTURE_DECIDE_STAGE_ID } from './workflow/StageIdPatterns';
import { GENERATION_STAGE_SOFT_CAP } from './workflow/WorkflowStageBudget';
import { WORKFLOW_LEVEL_STAGE_ID } from './workflow/WorkflowLevelIds';
import {
  COMPLEXITY_EXCEEDS_HARD_CAP,
  COMPLEXITY_HIGH_HITL_LIKELY,
  COMPLEXITY_NEAR_STAGE_LIMIT as COMPLEXITY_WARNING_NEAR_STAGE_LIMIT,
  COMPLEXITY_REQUIRES_GLOBAL_ARCHITECTURE_DECISION,
  formatComplexityWarningLine,
} from './lint/WorkflowWarningTokens';

export interface ComplexityEstimate {
  estimatedImplModules: number;
  requiresGlobalArchitectureDecision: boolean;
  estimatedStageCount: number;
  exceedsHardCap: boolean;
  suggestedDecomposition?: string[];
  highHitlLikely: boolean;
}


function countImplHints(userInput: string): number {
  const modules = userInput.match(/模块|module|服务|service|页面|page|api/gi);
  return Math.max(1, modules?.length ?? 1);
}

export function estimateWorkflowComplexity(
  userInput: string,
  snapshot?: CodebaseSnapshot,
): ComplexityEstimate {
  const trimmed = userInput.trim();
  const implModulesFromInput = countImplHints(trimmed);
  const moduleCountFromSnapshot = snapshot?.existingModules.length ?? 0;
  const estimatedImplModules = Math.max(
    implModulesFromInput,
    Math.min(COMPLEXITY_SNAPSHOT_MODULE_CAP, Math.ceil(moduleCountFromSnapshot / COMPLEXITY_SNAPSHOT_MODULES_DIVISOR)),
  );

  const requiresGlobalArchitectureDecision =
    userHintsMultiModuleOrFullProject(trimmed) ||
    estimatedImplModules >= COMPLEXITY_IMPL_THRESHOLD ||
    (snapshot?.existingModules.length ?? 0) > COMPLEXITY_EXISTING_MODULES_ARCH_TRIGGER;

  const perModuleStages = COMPLEXITY_PER_MODULE_STAGES;
  const baseStages = requiresGlobalArchitectureDecision
    ? COMPLEXITY_BASE_STAGES_WITH_ARCH
    : COMPLEXITY_BASE_STAGES_WITHOUT_ARCH;
  const estimatedStageCount = baseStages + estimatedImplModules * perModuleStages;
  const exceedsHardCap = estimatedStageCount > GENERATION_STAGE_SOFT_CAP;

  const suggestedDecomposition: string[] = [];
  if (requiresGlobalArchitectureDecision) {
    suggestedDecomposition.push(GLOBAL_ARCHITECTURE_DECIDE_STAGE_ID);
  }
  for (let i = 0; i < Math.min(estimatedImplModules, COMPLEXITY_SUGGESTED_DECOMPOSITION_MAX); i += 1) {
    suggestedDecomposition.push(`stage_decide_slice_${i + 1}`);
    suggestedDecomposition.push(`stage_impl_slice_${i + 1}`);
  }

  const highHitlLikely = requiresGlobalArchitectureDecision || /人工|审核|HITL|手动确认/i.test(trimmed);

  return {
    estimatedImplModules,
    requiresGlobalArchitectureDecision,
    estimatedStageCount,
    exceedsHardCap,
    suggestedDecomposition: suggestedDecomposition.length > 0 ? suggestedDecomposition : undefined,
    highHitlLikely,
  };
}

export function complexityEstimateToWarningLines(estimate: ComplexityEstimate): string[] {
  const warnings: string[] = [];
  if (estimate.exceedsHardCap) {
    warnings.push(formatComplexityWarningLine(COMPLEXITY_EXCEEDS_HARD_CAP, String(estimate.estimatedStageCount)));
  } else if (estimate.estimatedStageCount > COMPLEXITY_NEAR_STAGE_LIMIT) {
    warnings.push(formatComplexityWarningLine(COMPLEXITY_WARNING_NEAR_STAGE_LIMIT, String(estimate.estimatedStageCount)));
  }
  if (estimate.requiresGlobalArchitectureDecision) {
    warnings.push(
      formatComplexityWarningLine(COMPLEXITY_REQUIRES_GLOBAL_ARCHITECTURE_DECISION, WORKFLOW_LEVEL_STAGE_ID),
    );
  }
  if (estimate.highHitlLikely) {
    warnings.push(formatComplexityWarningLine(COMPLEXITY_HIGH_HITL_LIKELY, WORKFLOW_LEVEL_STAGE_ID));
  }
  return warnings;
}

export function formatComplexityBlockForPrompt(estimate: ComplexityEstimate): string {
  return [
    '【复杂度预估（M17.5，仅供参考）】',
    `- 预估 impl 模块数：${estimate.estimatedImplModules}`,
    `- 预估阶段总数：${estimate.estimatedStageCount}${estimate.exceedsHardCap ? `（超过 ${GENERATION_STAGE_SOFT_CAP} 硬上限，须削减或拆分）` : ''}`,
    `- 建议全局架构决策：${estimate.requiresGlobalArchitectureDecision ? '是' : '否'}`,
    estimate.suggestedDecomposition?.length
      ? `- 建议垂直切片骨架：${estimate.suggestedDecomposition.slice(0, COMPLEXITY_DECOMPOSITION_PREVIEW_MAX).join(', ')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}
