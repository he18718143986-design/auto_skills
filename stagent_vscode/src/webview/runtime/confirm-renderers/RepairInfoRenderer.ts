import type { BackendMessage } from '../../../WorkflowDefinition';
import { wMsg } from '../../l10n/wMsg';
import { escapeHtml } from '../shell';

type WorkflowGeneratedMsg = Extract<BackendMessage, { type: 'workflowGenerated' }>;

export function renderRepairInfo(msg: WorkflowGeneratedMsg): void {
  const repairEl = document.getElementById('confirm-repair-info');
  if (!repairEl) {
    return;
  }
  const repairs = Array.isArray(msg.structuralRepairs) ? msg.structuralRepairs : [];
  if (!repairs.length) {
    repairEl.style.display = 'none';
    repairEl.innerHTML = '';
  } else {
    let html =
      '<h4>' + wMsg('stagent.webview.confirm.repairM40Title') + '</h4><p class="muted">' + wMsg('stagent.webview.confirm.repairM40Body') + '</p><ul>';
    for (const r of repairs) {
      const ids = Array.isArray(r.stageIds) ? r.stageIds.join('、') : '';
      const conf = r.pathConfidence === 'deferred' ? wMsg('stagent.webview.confirm.pathDeferred') : '';
      html +=
        '<li><code>' +
        escapeHtml(String(r.code || '')) +
        '</code>：' +
        escapeHtml(ids) +
        conf +
        ' — ' +
        escapeHtml(String(r.message || '')) +
        '</li>';
    }
    html += '</ul>';
    repairEl.innerHTML = html;
    repairEl.style.display = 'block';
  }
}
