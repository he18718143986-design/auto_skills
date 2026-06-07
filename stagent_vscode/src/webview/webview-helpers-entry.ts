/**
 * M36 / #6：Webview 纯函数打包入口（esbuild → `out/webview/webview-helpers.js`）。
 * 由 `scripts/build-webview.mjs` 打包并在 bundle 末尾生成 `var fn = __stagentWebviewHelpers.fn` 全局绑定。
 */
export { getPauseUiState } from '../WebviewPauseUiState';
export { shouldHideOutput } from '../WebviewUiState';
export { buildAnswerQuestionsBeforeMessage } from '../QuestionBeforeFlow';
export {
  buildAnswerQuestionsMessage,
  formatRequiredAnswersValidationError,
  validateRequiredAnswers,
} from '../QuestionAfterFlow';
export {
  canProceedRetry,
  countDecisionRetryDownstreamStages,
  formatDecisionRetryConfirmMessage,
  getDecisionApproveAction,
  getUncheckedCount,
  shouldAskRetryConfirm,
  shouldShowDecisionConflictBanner,
  shouldShowQualitySoftPrompt,
} from '../DecisionReviewUi';
export { formatGlobalConfigSummaryForConfirm } from '../ArtifactUiHints';
export {
  buildPlanReviewChecklistLines,
  computePlanStageDiff,
  formatPlanStageDiffLines,
  formatPlanSummaryLines,
  formatStageSourceSummaryLines,
  isFirstDecisionStage,
  shouldShowPlanReviewChecklist,
} from '../WorkflowPlanSummary';
export { buildWorkflowDagGraphHtml, shouldShowWorkflowDagGraph } from '../WorkflowDagGraph';
export { buildLlmWaitingDetail, formatStreamCharSuffix } from '../WebviewInputGenerationUi';
export {
  buildConfirmStatsLines,
  collectArtifactPathsFromStages,
  countStagesByKind,
  getArtifactHeuristicWarnings,
  getStageArtifactPath,
  normalizeArtifactPath,
  parsePhaseFromTitle,
  stripPhasePrefix,
  truncateConfirmText,
} from '../WebviewConfirmPlanUi';

/** 与 build-webview.mjs / 单测共享的导出名单（勿与 entry re-export 漂移）。 */
export const WEBVIEW_HELPER_EXPORTS = [
  'getPauseUiState',
  'shouldHideOutput',
  'buildAnswerQuestionsBeforeMessage',
  'buildAnswerQuestionsMessage',
  'validateRequiredAnswers',
  'formatRequiredAnswersValidationError',
  'shouldShowQualitySoftPrompt',
  'getUncheckedCount',
  'shouldShowDecisionConflictBanner',
  'getDecisionApproveAction',
  'shouldAskRetryConfirm',
  'canProceedRetry',
  'countDecisionRetryDownstreamStages',
  'formatDecisionRetryConfirmMessage',
  'formatGlobalConfigSummaryForConfirm',
  'formatPlanSummaryLines',
  'formatStageSourceSummaryLines',
  'computePlanStageDiff',
  'formatPlanStageDiffLines',
  'isFirstDecisionStage',
  'shouldShowPlanReviewChecklist',
  'buildPlanReviewChecklistLines',
  'formatStreamCharSuffix',
  'buildLlmWaitingDetail',
  'buildWorkflowDagGraphHtml',
  'shouldShowWorkflowDagGraph',
  'normalizeArtifactPath',
  'getStageArtifactPath',
  'collectArtifactPathsFromStages',
  'getArtifactHeuristicWarnings',
  'parsePhaseFromTitle',
  'stripPhasePrefix',
  'truncateConfirmText',
  'countStagesByKind',
  'buildConfirmStatsLines',
] as const;
