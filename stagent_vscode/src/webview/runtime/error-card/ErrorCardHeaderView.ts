import { wMsg } from '../../l10n/wMsg';
import { escapeHtml } from '../shell';
import type { ErrorCardModel } from './ErrorCardModel';

export function appendErrorCardHeader(wrap: HTMLElement, model: ErrorCardModel): HTMLDetailsElement {
  const { msg, cfg, titleText, bodyText, categoryLabel, techSummaryLines } = model;

  const head = document.createElement('div');
  head.className = 'error-card-head';
  const ic = document.createElement('span');
  ic.className = 'error-card-icon';
  ic.textContent = cfg.icon;
  ic.setAttribute('aria-hidden', 'true');
  const titWrap = document.createElement('div');
  titWrap.className = 'error-card-head-text';
  const tit = document.createElement('div');
  tit.className = 'error-card-title';
  tit.textContent = titleText;
  titWrap.appendChild(tit);
  if (categoryLabel) {
    const badge = document.createElement('span');
    badge.className = 'error-card-category';
    badge.textContent = categoryLabel;
    titWrap.appendChild(badge);
  }
  head.appendChild(ic);
  head.appendChild(titWrap);
  wrap.appendChild(head);

  if (bodyText) {
    const body = document.createElement('div');
    body.className = 'error-card-body';
    body.textContent = bodyText;
    wrap.appendChild(body);
  }

  if (msg.playbookSteps && msg.playbookSteps.length) {
    const playbook = document.createElement('div');
    playbook.className = 'error-playbook';
    playbook.innerHTML =
      '<div class="error-playbook-title">' + escapeHtml(wMsg('stagent.webview.error.suggestedSteps')) + '</div><ol class="error-playbook-list">' +
      msg.playbookSteps.map(function (s) { return '<li>' + escapeHtml(s) + '</li>'; }).join('') +
      '</ol>';
    wrap.appendChild(playbook);
  }

  const details = document.createElement('details');
  details.className = 'error-tech-details';
  const summary = document.createElement('summary');
  summary.textContent = wMsg('stagent.webview.error.techDetailsSummary');
  details.appendChild(summary);
  const tech = document.createElement('div');
  tech.className = 'error-tech-body';
  tech.innerHTML = techSummaryLines.map(function (line) {
    return '<div class="error-tech-line">' + escapeHtml(line) + '</div>';
  }).join('');
  details.appendChild(tech);
  wrap.appendChild(details);
  return details;
}
