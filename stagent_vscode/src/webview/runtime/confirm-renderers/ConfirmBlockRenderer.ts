import type { BackendMessage } from '../../../WorkflowDefinition';
import { WEBVIEW_PROFILE_GATE_DIFF_PREVIEW_MAX } from '../../../UiListLimits';
import { wMsg } from '../../l10n/wMsg';
import { confirmStore } from '../stores';
import { escapeHtml } from '../shell';
import { syncDecisionStartGate } from './DecisionBoardRenderer';

type WorkflowGeneratedMsg = Extract<BackendMessage, { type: 'workflowGenerated' }>;

export function renderConfirmBlock(msg: WorkflowGeneratedMsg): boolean {
  const blockEl = document.getElementById('confirm-block')!;
  const reasons = Array.isArray(msg.blockReasons) ? msg.blockReasons : [];
  const blocked = !!msg.blocked && reasons.length > 0;
  confirmStore.planBlocked = blocked;
  syncDecisionStartGate();
  const hint = document.getElementById('confirm-dock-hint');
  if (hint) {
    const profileLine = confirmStore.settingsProfile ? 'Profile：' + confirmStore.settingsProfile : '';
    const diffLine =
      confirmStore.profileGateDiff && confirmStore.profileGateDiff.length
        ? confirmStore.profileGateDiff.slice(0, WEBVIEW_PROFILE_GATE_DIFF_PREVIEW_MAX).join(' · ')
        : '';
    const expLine =
      confirmStore.experienceReferencesUsed > 0 ? wMsg('stagent.webview.confirm.experienceRefs', confirmStore.experienceReferencesUsed) : '';
    const meta = [profileLine, diffLine, expLine].filter(Boolean).join(' · ');
    hint.textContent = blocked
      ? wMsg('stagent.webview.confirm.blockingPlan') + (meta ? '（' + meta + '）' : '')
      : meta;
  }
  if (!blocked) {
    blockEl.style.display = 'none';
    blockEl.innerHTML = '';
  } else {
    let html = '<h4>' + wMsg('stagent.webview.confirm.cannotExecuteTitle') + '</h4><ul>';
    for (const r of reasons) {
      html += '<li>' + escapeHtml(r) + '</li>';
    }
    html +=
      '</ul><div>' + wMsg('stagent.webview.confirm.cannotExecuteFoot') + '</div>';
    blockEl.innerHTML = html;
    blockEl.style.display = 'block';
  }
  return blocked;
}
