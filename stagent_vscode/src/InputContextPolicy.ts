/**
 * resolveInput 上下文策略聚合入口。
 *
 * 1.3：实现按内聚边界拆分到 `input-context/{degradePolicy,budgetAllocation}.ts`，
 * 本文件仅做再导出以保持对外公开 API 不变（既有 `from './InputContextPolicy'` 导入零改动）。
 */

/** 与 WorkflowEngine.resolveInput 总上下文上限一致（定义见 InputTokenBudgets）。 */
export {
  DEFAULT_CODEBASE_CONTEXT_MAX_TOKENS,
  DEFAULT_CONTEXT_TOTAL_TOKEN_LIMIT,
  DEFAULT_GLOBAL_DECISION_CONTEXT_MAX_TOKENS,
  DEFAULT_RESERVED_FOR_OUTPUT_TOKENS,
  DEFAULT_USER_INPUT_MAX_TOKENS,
} from './InputTokenBudgets';

export type {
  InputSourceRole,
  InputDegradeMode,
  InputDegradeThresholds,
} from './input-context/degradePolicy';
export {
  INPUT_THRESHOLDS_DEFAULT,
  INPUT_THRESHOLDS_DECISION_RECORD,
  INPUT_THRESHOLDS_IMPLEMENTATION,
  thresholdsForRole,
  classifyStageOutputSource,
  resolveExplicitContextDegradeMode,
  planInputDegradeMode,
  pickEntryIndexToDegrade,
} from './input-context/degradePolicy';

export type {
  ContextBudgetCategory,
  ContextBudget,
  ContextBudgetRequest,
  ContextBudgetAllocation,
  AllocateContextBudgetOptions,
  AllocateContextBudgetResult,
} from './input-context/budgetAllocation';
export {
  STAGENT_CODEBASE_SNAPSHOT_LABEL,
  classifyInputSourceBudgetCategory,
  allocateContextBudget,
  truncateTextToTokenBudget,
} from './input-context/budgetAllocation';
