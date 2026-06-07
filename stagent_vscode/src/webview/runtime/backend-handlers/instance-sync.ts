import type { BackendMessage, WorkflowDefinition } from '../../../WorkflowDefinition';
import { wMsg } from '../../l10n/wMsg';
import { confirmStore, execStore } from '../stores';
import { isViewActive, show } from '../shell';
import { applySessionFromBackend } from '../session';
import { showInputPageError } from '../view-input';
import { hideExecErrorDock } from '../view-exec';
import { applyStageStatusSnapshot } from '../stageStatusStore';
import { acceptUiEpochFromInstanceResumed } from '../uiEpochGate';
import { resetInstanceScopedUiState } from '../instanceScopedReset';
import type { BackendMessageHandler } from './types';
import { scheduleUiRefresh } from '../uiRefreshScheduler';

function handleInstanceResumed(msg: Extract<BackendMessage, { type: 'instanceResumed' }>): void {
  if (msg.instanceKey || msg.sessionId) {
    applySessionFromBackend(msg as { instanceKey?: string; sessionId?: string });
  }
  resetInstanceScopedUiState();
  acceptUiEpochFromInstanceResumed(msg.uiEpoch);
  confirmStore.workflowDef = msg.workflow as WorkflowDefinition;
  show('exec');
  if (msg.stageStatuses && typeof msg.stageStatuses === 'object') {
    applyStageStatusSnapshot(msg.stageStatuses, msg.seq);
  }
  confirmStore.selectedStageId = msg.failedStageId || confirmStore.workflowDef?.stages?.[0]?.id || null;
  // failedStageId 会随 recovery 重放 stageError（含 enrich 后的错误卡）；此处勿用 raw 文案盖住卡片。
  if (msg.instanceStatus === 'failed' && msg.failedSummary && !msg.failedStageId) {
    hideExecErrorDock();
    const fb = document.getElementById('fail-banner');
    fb!.style.display = 'block';
    fb!.textContent = msg.failedSummary.error || wMsg('stagent.webview.exec.workflowRunFailed');
  }
  if (msg.instanceStatus === 'completed') {
    document.getElementById('done-banner')!.style.display = 'block';
  }
  scheduleUiRefresh(['timeline']);
}

function handleInstanceSwitchBlocked(
  msg: Extract<BackendMessage, { type: 'instanceSwitchBlocked' }>,
): void {
  const reason = msg.reason || wMsg('stagent.webview.exec.cannotSwitchTask');
  const dockHint = document.getElementById('confirm-dock-hint');
  if (isViewActive('view-confirm') && dockHint) {
    dockHint.textContent = '⚠ ' + reason;
  } else {
    hideExecErrorDock();
    const fb = document.getElementById('fail-banner');
    fb!.style.display = 'block';
    fb!.textContent = '⚠ ' + reason;
  }
}

function handleActionHint(msg: Extract<BackendMessage, { type: 'actionHint' }>): void {
  const text = msg.message || wMsg('stagent.webview.exec.actionNotApplied');
  // Route the hint to whatever view the user is actually looking at, otherwise it is invisible
  // (the exec fail-banner lives inside #view-exec).
  if (isViewActive('view-input')) {
    showInputPageError(text);
    return;
  }
  if (isViewActive('view-confirm')) {
    const dockHint = document.getElementById('confirm-dock-hint');
    if (dockHint) {
      dockHint.textContent = '⚠ ' + text;
      return;
    }
  }
  hideExecErrorDock();
  const fb = document.getElementById('fail-banner');
  fb!.style.display = 'block';
  fb!.className = 'banner error';
  fb!.textContent = '⚠ ' + text;
}

function handleSessionSynced(msg: BackendMessage): void {
  if (msg.type !== 'sessionSynced' && msg.type !== 'instanceKeySynced') {
    return;
  }
  if (msg.instanceKey || msg.sessionId) {
    applySessionFromBackend(msg as { instanceKey?: string; sessionId?: string });
  }
}

export const instanceSyncHandlers: Record<string, BackendMessageHandler> = {
  instanceResumed: (msg) => handleInstanceResumed(msg as Extract<BackendMessage, { type: 'instanceResumed' }>),
  instanceSwitchBlocked: (msg) =>
    handleInstanceSwitchBlocked(msg as Extract<BackendMessage, { type: 'instanceSwitchBlocked' }>),
  actionHint: (msg) => handleActionHint(msg as Extract<BackendMessage, { type: 'actionHint' }>),
  sessionSynced: handleSessionSynced,
  instanceKeySynced: handleSessionSynced,
};
