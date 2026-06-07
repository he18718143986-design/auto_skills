import { wMsg } from '../../l10n/wMsg';
import {
  FRONTEND_MSG_COPY_DEBUG_LOG,
  FRONTEND_MSG_RETRY,
  FRONTEND_MSG_UPSTREAM_FIX,
} from '../../../workflow/FrontendMessageTypes';
import { confirmStore } from '../stores';
import { show } from '../shell';
import { clearExecStageErrorUi } from '../view-exec-output-panel';
import { vscode } from '../vscode-api';
import {
  renderConfirmFooter,
  renderPlanArtifactsPanel,
  renderPlanStageCards,
  renderConfirmTimeline,
  showConfirmDetail,
} from '../view-confirm';
import type { ErrorCardModel } from './ErrorCardModel';
import type { ErrorExpandPanels } from './ErrorCardExpandPanels';

function toggleEl(el: HTMLElement | null) {
  if (!el) return;
  el.classList.toggle('visible');
  if (el.classList.contains('visible')) {
    const details = el.closest('details.error-tech-details');
    if (details && !(details as HTMLDetailsElement).open) {
      (details as HTMLDetailsElement).open = true;
    }
  }
}

export function mountErrorCardDockActions(
  model: ErrorCardModel,
  panels: ErrorExpandPanels,
): void {
  const { msg, actions, dockHintText } = model;
  const { rawBox, outBox } = panels;

  const errorDock = document.getElementById('exec-error-dock')!;
  errorDock.innerHTML = '';
  const dockHint = document.createElement('span');
  dockHint.className = 'dock-hint';
  dockHint.textContent = dockHintText;
  errorDock.appendChild(dockHint);

  actions.forEach(function (act) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = act.label;
    if (act.primary) {
      b.className = 'dock-primary';
    } else if (act.type === 'retry' && msg.weakenRetry) {
      b.className = 'secondary error-retry-weak';
    } else {
      b.className = 'secondary';
    }
    if (act.hint) {
      b.title = act.hint;
    }
    if (act.type === 'showRaw' && !msg.rawOutput) {
      b.title = wMsg('stagent.webview.error.noRawOutput');
    }
    b.onclick = function () {
      switch (act.type) {
        case 'retry':
          clearExecStageErrorUi();
          vscode.postMessage({ type: FRONTEND_MSG_RETRY, stageId: msg.stageId, comment: '' });
          break;
        case 'upstreamFix':
          clearExecStageErrorUi();
          vscode.postMessage({ type: FRONTEND_MSG_UPSTREAM_FIX, failedStageId: msg.stageId });
          break;
        case 'editInput':
          show('input');
          (document.getElementById('user-input') as HTMLTextAreaElement).focus();
          break;
        case 'showRaw':
          toggleEl(rawBox);
          break;
        case 'showOutput':
          toggleEl(outBox);
          break;
        case 'editWorkflow':
          if (!confirmStore.workflowDef) return;
          confirmStore.selectedStageId = msg.stageId;
          show('confirm');
          renderConfirmFooter();
          renderPlanArtifactsPanel();
          renderPlanStageCards();
          renderConfirmTimeline();
          showConfirmDetail();
          requestAnimationFrame(function () {
            const ul = document.getElementById('timeline');
            const hit = ul && ul.querySelector('li[data-id="' + msg.stageId.replace(/"/g, '') + '"]');
            if (hit) hit.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          });
          break;
        case 'showLog':
          vscode.postMessage({ type: FRONTEND_MSG_COPY_DEBUG_LOG });
          break;
        default:
          break;
      }
    };
    errorDock.appendChild(b);
  });
  errorDock.style.display = 'flex';
}
