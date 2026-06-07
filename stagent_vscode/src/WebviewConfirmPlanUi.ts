/** Re-export shim：确认页计划审查 UI 已拆分至 confirm-plan/*。 */
export type { ConfirmPlanStage, ConfirmStatsInput } from './confirm-plan';
export {
  normalizeArtifactPath,
  getStageArtifactPath,
  collectArtifactPathsFromStages,
  getArtifactHeuristicWarnings,
  parsePhaseFromTitle,
  stripPhasePrefix,
  truncateConfirmText,
  buildConfirmStatsLines,
  countStagesByKind,
} from './confirm-plan';
