export type PauseMode = 'decision' | 'normal' | null;

export interface PauseUiState {
  showPauseBar: boolean;
  mode: PauseMode;
  enableRetry: boolean;
  enableApprove: boolean;
  enableApproveDecision: boolean;
  /** When retry is disabled because the manual retry limit was reached. */
  retryDisabledHint?: string;
}

const RETRY_LIMIT_HINT = '该阶段手动重试已达上限，请修改工作流、调整输入或从其他阶段继续。';

export function getPauseUiState(
  currentPausedStageId: string | null,
  stageStatus: Record<string, string>,
  isDecisionStage: (stageId: string) => boolean,
  retryDisabled = false,
): PauseUiState {
  if (!currentPausedStageId) {
    return {
      showPauseBar: false,
      mode: null,
      enableRetry: false,
      enableApprove: false,
      enableApproveDecision: false,
    };
  }

  const status = stageStatus[currentPausedStageId];
  if (status !== 'paused') {
    return {
      showPauseBar: false,
      mode: null,
      enableRetry: false,
      enableApprove: false,
      enableApproveDecision: false,
    };
  }

  const enableRetry = !retryDisabled;
  const retryDisabledHint = retryDisabled ? RETRY_LIMIT_HINT : undefined;

  if (isDecisionStage(currentPausedStageId)) {
    return {
      showPauseBar: true,
      mode: 'decision',
      enableRetry,
      enableApprove: false,
      enableApproveDecision: true,
      retryDisabledHint,
    };
  }

  return {
    showPauseBar: true,
    mode: 'normal',
    enableRetry,
    enableApprove: true,
    enableApproveDecision: false,
    retryDisabledHint,
  };
}
