import { getPauseUiState } from '../../WebviewPauseUiState';
import { shouldHideOutput } from '../../WebviewUiState';
import { wMsg } from '../l10n/wMsg';
import { confirmStore, execStore } from './stores';
import { isDecisionStage } from './shell';

const maps = execStore.stageMaps;

export function getExecViewStageId() {
  if (execStore.execOutputPinnedStageId) {
    return execStore.execOutputPinnedStageId;
  }
  if (
    execStore.currentPausedStageId &&
    (maps.stageStatus[execStore.currentPausedStageId] === 'paused' ||
      maps.stageStatus[execStore.currentPausedStageId] === 'waiting-questions')
  ) {
    return execStore.currentPausedStageId;
  }
  return execStore.currentRunStageId || execStore.currentPausedStageId || null;
}

export function syncFollowLiveButton() {
  const btn = document.getElementById('btn-follow-live');
  if (!btn) {
    return;
  }
  btn.style.display = execStore.execOutputPinnedStageId ? '' : 'none';
}

export function syncOutputVisibility() {
  const output = document.getElementById('output');
  if (!output) {
    return;
  }
  const viewId = getExecViewStageId();
  const hideForDecisionPause =
    !!viewId &&
    viewId === execStore.currentPausedStageId &&
    shouldHideOutput(execStore.currentPausedStageId, maps.stageStatus, isDecisionStage);
  output.style.display = hideForDecisionPause ? 'none' : 'block';
}

export function refreshExecOutputPanel(stageIdOverride?: string | null) {
  const stageId = stageIdOverride || getExecViewStageId();
  const output = document.getElementById('output');
  const label = document.getElementById('output-label');
  syncFollowLiveButton();
  if (!stageId || !confirmStore.workflowDef) {
    label!.textContent = '';
    output!.textContent = '';
    return;
  }
  const st = (confirmStore.workflowDef.stages as Array<{ id: string; title?: string }>).find((s) => s.id === stageId);
  const title = st?.title ?? stageId;
  const status = maps.stageStatus[stageId] || 'pending';
  const pinned = execStore.execOutputPinnedStageId === stageId;
  if (pinned) {
    label!.textContent = wMsg('stagent.webview.exec.viewing', title);
  } else if (status === 'running') {
    label!.textContent = wMsg('stagent.webview.exec.running', title);
  } else if (status === 'paused') {
    if (stageId === execStore.currentPausedStageId && isDecisionStage(stageId)) {
      label!.textContent = wMsg('stagent.webview.exec.decisionReview', title);
    } else {
      label!.textContent = wMsg('stagent.webview.exec.paused', title);
    }
  } else if (status === 'error') {
    label!.textContent = wMsg('stagent.webview.exec.error', title);
  } else {
    label!.textContent = wMsg('stagent.webview.exec.output', title);
  }
  const cached = maps.stageOutputs[stageId];
  if (cached !== undefined && cached !== '') {
    output!.textContent = cached;
  } else if (status === 'pending' || status === 'skipped') {
    output!.textContent = wMsg('stagent.webview.exec.noOutputYet');
  } else if (status === 'running' || status === 'retrying') {
    output!.textContent = wMsg('stagent.webview.exec.waitingOutput');
  } else {
    output!.textContent = wMsg('stagent.webview.exec.noCachedOutput');
  }
  syncOutputVisibility();
}

export function pinExecOutputStage(stageId: string) {
  execStore.execOutputPinnedStageId = stageId;
  refreshExecOutputPanel(stageId);
}

export function clearExecOutputPin() {
  execStore.execOutputPinnedStageId = null;
  refreshExecOutputPanel();
}

export function shouldLiveUpdateExecOutput(stageId: string) {
  return !execStore.execOutputPinnedStageId || execStore.execOutputPinnedStageId === stageId;
}

export function hideExecErrorDock() {
  const dock = document.getElementById('exec-error-dock');
  if (!dock) {
    return;
  }
  dock.style.display = 'none';
  dock.innerHTML = '';
}

/** 清除阶段错误卡片与底部重试 dock（重试、阶段重新 running 时调用）。 */
export function clearExecStageErrorUi() {
  hideExecErrorDock();
  const banner = document.getElementById('fail-banner');
  if (!banner) {
    return;
  }
  banner.style.display = 'none';
  banner.textContent = '';
  banner.className = 'banner error';
}

export function resetPauseBarShell() {
  const bar = document.getElementById('pause-bar')!;
  bar.innerHTML = '';
  const scroll = document.createElement('div');
  scroll.className = 'pause-bar-scroll';
  const dock = document.createElement('div');
  dock.className = 'action-dock pause-bar-dock';
  bar.appendChild(scroll);
  bar.appendChild(dock);
  return { scroll, dock };
}

export function syncPauseBarVisibility() {
  const bar = document.getElementById('pause-bar')!;
  const retryDisabled = execStore.currentPausedStageId
    ? !!maps.retryDisabledByStage[execStore.currentPausedStageId]
    : false;
  const uiState = getPauseUiState(execStore.currentPausedStageId, maps.stageStatus, isDecisionStage, retryDisabled);
  const showBeforeQuestions =
    !!execStore.currentBeforeQuestionStageId && maps.stageStatus[execStore.currentBeforeQuestionStageId] === 'waiting-questions';
  const visible = uiState.showPauseBar || showBeforeQuestions;
  bar.classList.toggle('is-visible', visible);
  bar.style.display = visible ? 'flex' : 'none';
  bar.hidden = !visible;
  return uiState;
}
