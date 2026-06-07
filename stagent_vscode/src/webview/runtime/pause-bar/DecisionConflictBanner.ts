import { wMsg } from '../../l10n/wMsg';
import { confirmStore, execStore } from '../stores';

const maps = execStore.stageMaps;

export function appendDecisionConflictBanner(scroll: HTMLElement): HTMLElement | null {
  const approvedCount = (confirmStore.workflowDef?.stages ?? []).filter(
    (st: { isDecisionStage?: boolean; id: string }) =>
      st.isDecisionStage && maps.stageStatus[st.id] === 'done',
  ).length;
  if (approvedCount <= 0) {
    return null;
  }

  const banner = document.createElement('div');
  banner.style.marginTop = '8px';
  banner.style.padding = '8px';
  banner.style.border = '1px solid var(--vscode-widget-border)';
  banner.style.borderRadius = '4px';
  banner.textContent = wMsg('stagent.webview.pause.conflictBanner', approvedCount);
  const viewBtn = document.createElement('button');
  viewBtn.className = 'secondary';
  viewBtn.style.marginLeft = '8px';
  viewBtn.textContent = wMsg('stagent.webview.pause.viewApproved');
  banner.appendChild(viewBtn);
  const decisionSummaryEl = document.createElement('div');
  decisionSummaryEl.style.display = 'none';
  decisionSummaryEl.style.marginTop = '8px';
  viewBtn.onclick = () => {
    if (decisionSummaryEl.style.display === 'none') {
      decisionSummaryEl.innerHTML = '';
      (confirmStore.workflowDef?.stages ?? [])
        .filter((st: { isDecisionStage?: boolean; id: string }) => st.isDecisionStage && maps.stageStatus[st.id] === 'done')
        .forEach((s: { title: string; id: string }) => {
          const d = document.createElement('details');
          const summary = document.createElement('summary');
          summary.textContent = s.title;
          d.appendChild(summary);
          const pre = document.createElement('pre');
          pre.style.whiteSpace = 'pre-wrap';
          pre.textContent = String(maps.stageOutputs[s.id] ?? wMsg('stagent.webview.pause.noApprovedContent'));
          d.appendChild(pre);
          decisionSummaryEl.appendChild(d);
        });
      decisionSummaryEl.style.display = 'block';
    } else {
      decisionSummaryEl.style.display = 'none';
    }
  };
  scroll.appendChild(banner);
  return decisionSummaryEl;
}
