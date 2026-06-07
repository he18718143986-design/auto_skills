import type { BackendMessage } from '../../../WorkflowDefinition';
import { execStore } from '../stores';
import { isViewActive } from '../shell';
import { wMsg } from '../../l10n/wMsg';
import {
  clearExecStageErrorUi,
  hideExecErrorDock,
  renderStageErrorCard,
} from '../view-exec';
import { isPolishAssistantVisible, showInputPageError, showPolishPanelError } from '../view-input';
import type { BackendMessageHandler } from './types';
import { isStaleBackendSeq, patchStageStatus, tryAdvanceBackendSeq } from '../stageStatusStore';
import { scheduleUiRefresh } from '../uiRefreshScheduler';

function handleWorkflowFailed(msg: Extract<BackendMessage, { type: 'workflowFailed' }>): void {
  if (isPolishAssistantVisible()) {
    showPolishPanelError(msg.reason);
  } else if (isViewActive('view-exec')) {
    hideExecErrorDock();
    const fb = document.getElementById('fail-banner');
    fb!.style.display = 'block';
    fb!.textContent = msg.reason || wMsg('stagent.webview.exec.workflowFailed');
    if (msg.stageId) {
      patchStageStatus(msg.stageId, 'error', msg.seq);
    }
    scheduleUiRefresh(['timeline']);
  } else {
    showInputPageError(msg.reason);
  }
}

function handleWorkflowCompleted(msg: Extract<BackendMessage, { type: 'workflowCompleted' }>): void {
  if (!tryAdvanceBackendSeq(msg.seq)) {
    return;
  }
  const banner = document.getElementById('done-banner')!;
  banner.style.display = 'block';
  const warnings = Array.isArray(msg.warnings)
    ? msg.warnings.filter((w): w is string => typeof w === 'string' && w.length > 0)
    : [];
  const base = wMsg('stagent.webview.main.workflowComplete');
  banner.textContent = warnings.length > 0 ? `${base}\n收尾提示：\n- ${warnings.join('\n- ')}` : base;
  execStore.currentPausedStageId = null;
  clearExecStageErrorUi();
  scheduleUiRefresh(['pauseBarVisibility', 'outputVisibility', 'timeline']);
}

function handleStageError(msg: Extract<BackendMessage, { type: 'stageError' }>): void {
  if (isStaleBackendSeq(msg.seq)) {
    return;
  }
  patchStageStatus(msg.stageId, 'error', msg.seq);
  renderStageErrorCard(msg);
  scheduleUiRefresh(['timeline']);
}

export const artifactsErrorsHandlers: Record<string, BackendMessageHandler> = {
  workflowFailed: (msg) => handleWorkflowFailed(msg as Extract<BackendMessage, { type: 'workflowFailed' }>),
  workflowCompleted: (msg) =>
    handleWorkflowCompleted(msg as Extract<BackendMessage, { type: 'workflowCompleted' }>),
  stageError: (msg) => handleStageError(msg as Extract<BackendMessage, { type: 'stageError' }>),
};
