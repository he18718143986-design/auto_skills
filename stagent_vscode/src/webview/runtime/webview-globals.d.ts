/**
 * Ambient globals injected by webview-helpers.js / Preact entry bundles (prior script tags).
 * Single source for runtime `declare function` blocks — do not duplicate in view-*.ts.
 */

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };

declare function formatStreamCharSuffix(chars: number): string;

declare function getPauseUiState(
  pausedId: string | null,
  status: Record<string, string>,
  isDecision: (id: string) => boolean,
  retryDisabled?: boolean,
): {
  showPauseBar: boolean;
  mode: string;
  enableRetry: boolean;
  enableApprove: boolean;
  enableApproveDecision: boolean;
  retryDisabledHint?: string;
};

declare function shouldHideOutput(
  pausedId: string | null,
  status: Record<string, string>,
  isDecision: (id: string) => boolean,
): boolean;

declare function buildAnswerQuestionsBeforeMessage(
  stageId: string,
  answers: Record<string, string>,
): unknown;

declare function buildAnswerQuestionsMessage(
  stageId: string,
  answers: Record<string, string>,
): unknown;

declare function validateRequiredAnswers(
  questions: unknown[] | undefined,
  answers: Record<string, string> | undefined,
): { ok: boolean; missingIds: string[] };

declare function formatRequiredAnswersValidationError(missing: string[]): string;

declare function getDecisionApproveAction(total: number, checked: number): string;

declare function getUncheckedCount(total: number, checked: number): number;

declare function shouldAskRetryConfirm(approvedCount: number): boolean;

declare function canProceedRetry(approvedCount: number, ok: boolean): boolean;

declare function countDecisionRetryDownstreamStages(
  workflow: Record<string, unknown> | null,
  stageId: string,
): number;

declare function formatDecisionRetryConfirmMessage(n: number): string;

declare function formatGlobalConfigSummaryForConfirm(cfg: unknown): string;

declare function formatPlanSummaryLines(summary: unknown): string[];

declare function formatStageSourceSummaryLines(rows: unknown[], stageId?: string): string[];

declare function computePlanStageDiff(prev: string[], next: string[]): unknown;

declare function formatPlanStageDiffLines(diff: unknown, hadPrevious: boolean): string[];

declare function shouldShowPlanReviewChecklist(
  workflow: Record<string, unknown> | null,
  stageId: string,
  warnings: unknown[],
  summary: unknown,
): boolean;

declare function buildPlanReviewChecklistLines(
  workflow: Record<string, unknown> | null,
  summary: unknown,
  warnings: unknown[],
): string[];

declare function shouldShowDecisionConflictBanner(count: number): boolean;

declare function getStageArtifactPath(stage: Record<string, unknown>): string | null;

declare function collectArtifactPathsFromStages(stages: unknown[]): string[];

declare function getArtifactHeuristicWarnings(paths: string[], stages: unknown[]): string[];

declare function parsePhaseFromTitle(title: string): string;

declare function stripPhasePrefix(title: string): string;

declare function truncateConfirmText(text: string, max: number): string;

declare function countStagesByKind(stages: unknown[]): Record<string, number>;

declare function buildConfirmStatsLines(opts: Record<string, unknown>): string[];

declare function buildWorkflowDagGraphHtml(
  stages: unknown[],
  globalConfig: unknown,
  escapeFn: (s: string) => string,
  opts?: Record<string, unknown>,
): string;

declare function mountDecisionPauseBarDock(
  container: HTMLElement,
  props: {
    enableRetry: boolean;
    enableApprove: boolean;
    onRetry: () => void;
    onApprove: () => void;
    onForceApprove?: () => void;
    showForceApprove?: boolean;
  },
): void;

declare function mountStageTimeline(
  container: HTMLElement,
  props: {
    stages: Array<{
      id: string;
      title: string;
      status: string;
      isDecisionStage?: boolean;
      selected?: boolean;
    }>;
    onSelect: (stageId: string) => void;
  },
): void;
