import { wMsg } from '../../l10n/wMsg';
import { escapeHtml } from '../shell';
import type { ErrorCardModel } from './ErrorCardModel';

export interface ErrorExpandPanels {
  rawBox: HTMLDivElement;
  outBox: HTMLDivElement;
}

export function appendErrorCardExpandPanels(
  wrap: HTMLElement,
  model: ErrorCardModel,
  techDetails: HTMLDetailsElement,
): ErrorExpandPanels {
  const rawBox = document.createElement('div');
  rawBox.className = 'error-expand';
  rawBox.id = 'err-expand-raw';

  const outBox = document.createElement('div');
  outBox.className = 'error-expand';
  outBox.id = 'err-expand-out';

  techDetails.appendChild(rawBox);
  techDetails.appendChild(outBox);
  renderErrorExpandPanels({ rawBox, outBox }, model);
  return { rawBox, outBox };
}

export function renderErrorExpandPanels(panels: ErrorExpandPanels, model: ErrorCardModel): void {
  const { msg } = model;
  const { rawBox, outBox } = panels;

  rawBox.innerHTML =
    '<div class="error-expand-label">' + escapeHtml(wMsg('stagent.webview.error.rawOutputHeading')) + '</div><pre class="error-expand-pre">' +
    escapeHtml(msg.rawOutput || wMsg('stagent.webview.error.none')) +
    '</pre>';

  const so = msg.stdout != null ? String(msg.stdout) : '';
  const se = msg.stderr != null ? String(msg.stderr) : '';
  outBox.innerHTML =
    '<div class="error-expand-label">stdout / stderr</div>' +
    '<div><strong>stdout</strong></div><pre class="error-expand-pre">' +
    escapeHtml(so || wMsg('stagent.webview.error.empty')) +
    '</pre>' +
    '<div><strong>stderr</strong></div><pre class="error-expand-pre">' +
    escapeHtml(se || wMsg('stagent.webview.error.empty')) +
    '</pre>';
}
