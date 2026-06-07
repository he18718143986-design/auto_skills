import { wMsg } from '../../l10n/wMsg';
import type { BackendMessage } from '../../../WorkflowDefinition';
import { setConfirmSectionVisible } from '../shell';

type WorkflowGeneratedMsg = Extract<BackendMessage, { type: 'workflowGenerated' }>;

export function renderWorkflowWarnings(msg: WorkflowGeneratedMsg): void {
  const warnEl = document.getElementById('wf-warn')!;
  const display =
    msg.warningsDisplay && msg.warningsDisplay.length ? msg.warningsDisplay : msg.warnings || [];
  if (!display.length) {
    warnEl.textContent = '';
    setConfirmSectionVisible('section-warnings', false);
  } else {
    setConfirmSectionVisible('section-warnings', true);
    warnEl.textContent = wMsg('stagent.webview.confirm.warningsPrefix') + display.join('\n');
  }
}
