/** P1-6：执行视图门面 — 子模块 re-export + reset/register。 */
export {
  getExecViewStageId,
  syncFollowLiveButton,
  syncOutputVisibility,
  refreshExecOutputPanel,
  shouldLiveUpdateExecOutput,
  hideExecErrorDock,
  clearExecStageErrorUi,
  resetPauseBarShell,
  syncPauseBarVisibility,
  pinExecOutputStage,
} from './view-exec-output-panel';

export { renderStageErrorCard } from './view-exec-error-card';

export {
  renderExecTimeline,
  selectExecTimelineStage,
  renderDownstreamResetPanel,
  formatConfidenceBar,
  confidenceWarn,
} from './view-exec-stage-list';

export { renderExecDagGraph } from './view-exec-dag-graph';

export {
  collectArtifactHintsForStage,
  appendStageArtifactActions,
  getQuestionAfter,
  collectAnswersFromQuestionFields,
  applyQuestionValidationUi,
  renderQuestionsFormInPauseBar,
  renderAfterQuestionsCard,
  renderBeforeQuestionsCard,
  renderDecisionChecklist,
  renderPauseBar,
} from './view-exec-decision-form';

import { execStore, resetExecStore } from './stores';
import { resetStageStatusSeqState } from './stageStatusStore';
import {
  FRONTEND_MSG_COPY_DEBUG_LOG,
  FRONTEND_MSG_COPY_SESSION_LOG,
} from '../../workflow/FrontendMessageTypes';
import { vscode } from './vscode-api';

const maps = execStore.stageMaps;
import {
  clearExecStageErrorUi,
  syncFollowLiveButton,
  syncOutputVisibility,
  syncPauseBarVisibility,
  clearExecOutputPin as clearPinBase,
} from './view-exec-output-panel';
import { resetExecCockpit, renderExecCockpit } from './view-exec-cockpit';
import { renderQualityReport } from './view-quality-report';
import { renderExecTimeline } from './view-exec-stage-list';

export function clearExecOutputPin() {
  clearPinBase();
  renderExecTimeline();
}

export function resetExecUi() {
  resetExecStore();
  resetStageStatusSeqState();
  resetExecCockpit();
  resetExecDomChrome();
  syncFollowLiveButton();
  syncPauseBarVisibility();
  syncOutputVisibility();
  renderExecCockpit();
  renderQualityReport();
}

function resetExecDomChrome(): void {
  document.getElementById('done-banner')!.style.display = 'none';
  const drp = document.getElementById('downstream-reset-panel')!;
  drp.style.display = 'none';
  drp.innerHTML = '';
  const fb = document.getElementById('fail-banner')!;
  fb.style.display = 'none';
  fb.textContent = '';
  fb.className = 'banner error';
  clearExecStageErrorUi();
  document.getElementById('output')!.textContent = '';
  const qr = document.getElementById('quality-report-panel');
  if (qr) {
    qr.hidden = true;
    qr.style.display = 'none';
    qr.innerHTML = '';
  }
  const execBody = document.getElementById('exec-cockpit-body');
  if (execBody) {
    execBody.style.display = '';
  }
}

export function registerExecView(): void {
  document.getElementById('btn-copy-debug')!.onclick = () => {
    vscode.postMessage({ type: FRONTEND_MSG_COPY_DEBUG_LOG });
  };
  const btnFollowLive = document.getElementById('btn-follow-live');
  if (btnFollowLive) btnFollowLive.onclick = () => clearExecOutputPin();
  const btnCopySession = document.getElementById('btn-copy-session');
  if (btnCopySession) btnCopySession.onclick = () => vscode.postMessage({ type: FRONTEND_MSG_COPY_SESSION_LOG });
}
