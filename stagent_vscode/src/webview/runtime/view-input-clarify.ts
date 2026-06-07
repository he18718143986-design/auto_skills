/**
 * 输入页澄清问答浮层（从 view-input.ts 抽出，1.3）。
 * 仅依赖 view-input 的忙碌态/可见性/生成入口，单向依赖、无回环。
 */
import { wMsg } from '../l10n/wMsg';
import { escapeHtml } from './shell';
import { inputStore } from './stores';
import {
  clearInputPageBusy,
  sendGenerateWorkflow,
  syncInputActionsVisibility,
} from './view-input';

let clarifyEscHandler: ((ev: KeyboardEvent) => void) | null = null;

export function detachClarifyEscHandler() {
  if (clarifyEscHandler) {
    document.removeEventListener('keydown', clarifyEscHandler);
    clarifyEscHandler = null;
  }
}

export function closeClarifyOverlay() {
  detachClarifyEscHandler();
  const existing = document.getElementById('clarify-overlay');
  if (existing) {
    existing.remove();
  }
}

export function cancelClarifyOverlay() {
  closeClarifyOverlay();
  inputStore.pendingClarifyInput = null;
  clearInputPageBusy();
  syncInputActionsVisibility();
}

export function renderClarifyOverlay(userInput, questions) {
  clearInputPageBusy();
  closeClarifyOverlay();
  const overlay = document.createElement('div');
  overlay.id = 'clarify-overlay';
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;' +
    'background:rgba(0,0,0,0.45);padding:24px;';
  const card = document.createElement('div');
  card.style.cssText =
    'max-width:560px;width:100%;max-height:80vh;overflow:auto;border-radius:8px;padding:18px 20px;' +
    'background:var(--vscode-editor-background);border:1px solid var(--vscode-panel-border);' +
    'box-shadow:0 8px 32px rgba(0,0,0,0.35);';
  let html =
    '<div style="font-size:14px;font-weight:600;margin-bottom:4px;">' +
    wMsg('stagent.webview.input.clarifyTitle') +
    '</div>' +
    '<div style="font-size:12px;color:var(--vscode-descriptionForeground);margin-bottom:14px;">' +
    wMsg('stagent.webview.input.clarifyIntro') +
    '</div>';
  questions.forEach((q, idx) => {
    const qid = escapeHtml(q.id || ('q' + idx));
    html += '<div style="margin-bottom:14px;" data-qid="' + qid + '">';
    html += '<div style="font-size:12px;margin-bottom:6px;">' + escapeHtml(q.text || '') + '</div>';
    if (Array.isArray(q.options) && q.options.length > 0) {
      q.options.forEach((opt, oi) => {
        const optVal = escapeHtml(opt);
        html += '<label style="display:flex;align-items:center;gap:6px;font-size:12px;margin:3px 0;cursor:pointer;">' +
          '<input type="radio" name="clarify-' + qid + '" value="' + optVal + '"' + (oi === 0 ? ' checked' : '') + '>' +
          '<span>' + optVal + '</span></label>';
      });
    } else {
      html += '<input type="text" class="clarify-text" ' +
        'style="width:100%;padding:5px 8px;background:var(--vscode-input-background);' +
        'color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border, var(--vscode-panel-border));' +
        'border-radius:4px;font-size:12px;" placeholder="' +
        escapeHtml(wMsg('stagent.webview.input.clarifyAnswerPlaceholder')) +
        '">';
    }
    html += '</div>';
  });
  html += '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px;">' +
    '<button id="clarify-skip" style="padding:5px 12px;border:1px solid var(--vscode-panel-border);' +
    'background:transparent;color:var(--vscode-foreground);border-radius:4px;cursor:pointer;font-size:12px;">' +
    wMsg('stagent.webview.input.clarifySkip') +
    '</button>' +
    '<button id="clarify-submit" style="padding:5px 12px;border:none;' +
    'background:var(--vscode-button-background);color:var(--vscode-button-foreground);border-radius:4px;cursor:pointer;font-size:12px;">' +
    wMsg('stagent.webview.input.clarifySubmit') +
    '</button>' +
    '</div>';
  card.innerHTML = html;
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  const collectAnswers = () => {
    const answers = {};
    card.querySelectorAll('[data-qid]').forEach((block) => {
      const qid = block.getAttribute('data-qid');
      const radio = block.querySelector('input[type="radio"]:checked');
      const textInput = block.querySelector('input.clarify-text');
      if (radio) {
        answers[qid] = radio.value;
      } else if (textInput && textInput.value.trim()) {
        answers[qid] = textInput.value.trim();
      }
    });
    return answers;
  };

  card.querySelector('#clarify-submit').onclick = () => {
    const answers = collectAnswers();
    closeClarifyOverlay();
    sendGenerateWorkflow(userInput, answers);
  };
  card.querySelector('#clarify-skip').onclick = () => {
    closeClarifyOverlay();
    sendGenerateWorkflow(userInput);
  };

  clarifyEscHandler = (ev) => {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      cancelClarifyOverlay();
    }
  };
  document.addEventListener('keydown', clarifyEscHandler);
}
