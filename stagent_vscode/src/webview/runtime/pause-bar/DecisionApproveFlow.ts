import { wMsg } from '../../l10n/wMsg';
import { FRONTEND_MSG_APPROVE_DECISION } from '../../../workflow/FrontendMessageTypes';
import { getOutboundSessionId } from '../session';
import { vscode } from '../vscode-api';

export interface DecisionApproveFlowElements {
  btnApprove: HTMLButtonElement;
  qualityWarn: HTMLDivElement;
  forceApproveBtn: HTMLButtonElement;
  doApprove: () => void;
  countChecks: () => { total: number; checked: number };
}

export function mountDecisionApproveFlow(
  scroll: HTMLElement,
  stageId: string,
  enableApprove: boolean,
  onDockRefresh?: () => void,
): DecisionApproveFlowElements {
  const btnApprove = document.createElement('button');
  btnApprove.textContent = wMsg('stagent.webview.pause.decisionApprove');
  btnApprove.disabled = !enableApprove;

  const qualityWarn = document.createElement('div');
  qualityWarn.style.display = 'none';
  qualityWarn.style.marginTop = '8px';
  qualityWarn.style.padding = '8px';
  qualityWarn.style.border = '1px solid var(--vscode-editorWarning-foreground)';
  qualityWarn.style.borderRadius = '4px';
  const qualityWarnText = document.createElement('span');
  qualityWarn.appendChild(qualityWarnText);

  const forceApproveBtn = document.createElement('button');
  forceApproveBtn.className = 'secondary';
  forceApproveBtn.textContent = wMsg('stagent.webview.pause.forceApprove');
  forceApproveBtn.style.display = 'none';

  const doApprove = () => {
    if (!enableApprove) {
      return;
    }
    const sessionId = getOutboundSessionId();
    const editor = document.getElementById('decision-editor') as HTMLTextAreaElement | null;
    vscode.postMessage({
      type: FRONTEND_MSG_APPROVE_DECISION,
      stageId,
      decisionRecord: editor?.value ?? '',
      ...(sessionId ? { sessionId } : {}),
    });
  };

  const countChecks = () => {
    const boxes = Array.from(scroll.querySelectorAll('.q-panel input[type=checkbox]'));
    const checked = boxes.filter((b) => (b as HTMLInputElement).checked).length;
    return { total: boxes.length, checked };
  };

  let qualityPromptShown = false;
  btnApprove.onclick = () => {
    const counts = countChecks();
    if (
      !qualityPromptShown &&
      getDecisionApproveAction(counts.total, counts.checked) === 'show-soft-prompt'
    ) {
      qualityPromptShown = true;
      const left = getUncheckedCount(counts.total, counts.checked);
      qualityWarnText.textContent =
        wMsg('stagent.webview.pause.qualitySoftPrompt', left);
      qualityWarn.style.display = 'block';
      forceApproveBtn.style.display = '';
      onDockRefresh?.();
      qualityWarn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    qualityWarn.style.display = 'none';
    forceApproveBtn.style.display = 'none';
    onDockRefresh?.();
    doApprove();
  };
  forceApproveBtn.onclick = () => {
    qualityWarn.style.display = 'none';
    forceApproveBtn.style.display = 'none';
    onDockRefresh?.();
    doApprove();
  };

  scroll.appendChild(qualityWarn);

  return { btnApprove, qualityWarn, forceApproveBtn, doApprove, countChecks };
}
