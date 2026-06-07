import { wMsg } from '../../l10n/wMsg';
import {
  FRONTEND_MSG_APPROVE,
  FRONTEND_MSG_RETRY,
} from '../../../workflow/FrontendMessageTypes';
import { vscode } from '../vscode-api';
import { appendStageArtifactActions } from './artifact-actions';
import type { PauseBarShellContext } from './PauseBarShell';

export function renderStandardPauseBar(ctx: PauseBarShellContext): void {
  const { scroll, dock, stageId, uiState } = ctx;

  document.getElementById('output-label')!.textContent = wMsg('stagent.webview.pause.waitReviewLabel', stageId);
  appendStageArtifactActions(scroll, stageId);
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.placeholder = wMsg('stagent.webview.pause.feedbackPlaceholder');
  const btnRetry = document.createElement('button');
  btnRetry.className = 'secondary';
  btnRetry.textContent = wMsg('stagent.webview.pause.retryRegenerate');
  btnRetry.disabled = !uiState.enableRetry;
  if (!uiState.enableRetry && uiState.retryDisabledHint) {
    btnRetry.title = uiState.retryDisabledHint;
  }
  btnRetry.onclick = () =>
    uiState.enableRetry &&
    vscode.postMessage({ type: FRONTEND_MSG_RETRY, stageId, comment: inp.value || '' });
  const btnApprove = document.createElement('button');
  btnApprove.textContent = wMsg('stagent.webview.pause.approveContinue');
  btnApprove.disabled = !uiState.enableApprove;
  btnApprove.onclick = () => uiState.enableApprove && vscode.postMessage({ type: FRONTEND_MSG_APPROVE, stageId });
  scroll.appendChild(inp);
  dock.appendChild(btnRetry);
  dock.appendChild(btnApprove);
}
