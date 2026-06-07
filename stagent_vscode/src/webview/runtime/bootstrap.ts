import { vscode } from './vscode-api';
import { show, syncWorkflowSteps } from './shell';
import { confirmStore } from './stores';
import { getOutboundSessionId } from './session';
import { registerInputView, syncInputActionsVisibility } from './view-input';
import { registerConfirmView } from './view-confirm';
import { registerExecView, renderExecTimeline, resetExecUi } from './view-exec';
import { registerMessageHandler } from './messages';
import {
  FRONTEND_MSG_START_EXECUTION,
  FRONTEND_MSG_WEBVIEW_READY,
} from '../../workflow/FrontendMessageTypes';
import { execStore } from './stores';

declare global {
  interface Window {
    __STAGENT_WEBVIEW_TEST__?: boolean;
    __stagentExecStore?: typeof execStore;
  }
}

if (typeof window !== 'undefined' && window.__STAGENT_WEBVIEW_TEST__) {
  window.__stagentExecStore = execStore;
}

export function bootstrapMainWebview(): void {
  document.getElementById('btn-start')!.onclick = () => {
    if (!confirmStore.workflowDef) return;
    if ((document.getElementById('btn-start') as HTMLButtonElement).disabled) return;
    show('exec');
    const sessionId = getOutboundSessionId();
    vscode.postMessage({
      type: FRONTEND_MSG_START_EXECUTION,
      workflow: confirmStore.workflowDef,
      ...(sessionId ? { sessionId } : {}),
    });
    resetExecUi();
    renderExecTimeline();
  };
  document.querySelectorAll('.workflow-step').forEach((btn) => {
    btn.addEventListener('click', () => {
      const el = btn as HTMLButtonElement;
      if (el.disabled) return;
      const step = el.getAttribute('data-step');
      if (step === 'input') {
        show('input');
        (document.getElementById('user-input') as HTMLTextAreaElement).focus();
      } else if (step === 'confirm' && confirmStore.workflowDef) {
        show('confirm');
      }
    });
  });
  syncWorkflowSteps('input');
  registerInputView();
  registerConfirmView();
  registerExecView();
  registerMessageHandler();
  syncInputActionsVisibility();
  vscode.postMessage({ type: FRONTEND_MSG_WEBVIEW_READY });
}
