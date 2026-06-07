import { confirmStore } from '../stores';
import { FRONTEND_MSG_RETRY } from '../../../workflow/FrontendMessageTypes';
import { vscode } from '../vscode-api';
import { approvedDecisionCount } from '../shell';
import type { PauseBarShellContext } from './PauseBarShell';
import { mountDecisionEditorPanel } from './DecisionEditorPanel';
import { mountDecisionApproveFlow } from './DecisionApproveFlow';
import { wireDecisionPauseBarDock } from './DecisionPauseBarDock';

export function wireDecisionPauseBarControls(ctx: PauseBarShellContext, decisionSummaryEl: HTMLElement | null): void {
  const { scroll, dock, stageId, uiState, outputText } = ctx;

  const { editor, retryPrompt, btnRetry } = mountDecisionEditorPanel(
    scroll,
    outputText,
    !!uiState.enableRetry,
    () => {
      if (!uiState.enableRetry) return;
      const count = approvedDecisionCount();
      if (shouldAskRetryConfirm(count)) {
        const downstream = countDecisionRetryDownstreamStages(confirmStore.workflowDef, stageId);
        const ok = confirm(formatDecisionRetryConfirmMessage(downstream));
        if (!canProceedRetry(count, ok)) return;
      }
      vscode.postMessage({ type: FRONTEND_MSG_RETRY, stageId, comment: retryPrompt.value || '' });
    },
  );

  let refreshDock: () => void = () => {};
  const { btnApprove, forceApproveBtn } = mountDecisionApproveFlow(
    scroll,
    stageId,
    !!uiState.enableApproveDecision,
    () => refreshDock(),
  );

  if (decisionSummaryEl) {
    scroll.appendChild(decisionSummaryEl);
  }

  refreshDock = wireDecisionPauseBarDock(dock, btnRetry, btnApprove, forceApproveBtn, uiState);

  void editor;
}
