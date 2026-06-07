import { wMsg } from '../../l10n/wMsg';
import { renderDecisionChecklist } from './decision-checklist';

export interface DecisionEditorElements {
  editor: HTMLTextAreaElement;
  retryPrompt: HTMLInputElement;
  btnRetry: HTMLButtonElement;
}

export function mountDecisionEditorPanel(
  scroll: HTMLElement,
  outputText: string,
  enableRetry: boolean,
  onRetry: () => void,
): DecisionEditorElements {
  const editor = document.createElement('textarea');
  editor.id = 'decision-editor';
  editor.value = outputText;

  const retryPrompt = document.createElement('input');
  retryPrompt.type = 'text';
  retryPrompt.placeholder = wMsg('stagent.webview.pause.retryPromptPlaceholder');

  const btnRetry = document.createElement('button');
  btnRetry.className = 'secondary';
  btnRetry.textContent = wMsg('stagent.webview.pause.aiRegenerate');
  btnRetry.disabled = !enableRetry;
  btnRetry.onclick = () => {
    if (!enableRetry) return;
    onRetry();
  };

  scroll.appendChild(editor);
  scroll.appendChild(retryPrompt);
  renderDecisionChecklist(scroll, editor.value);

  editor.oninput = () => {
    const old = scroll.querySelector('.q-panel');
    if (old) old.remove();
    renderDecisionChecklist(scroll, editor.value);
  };

  return { editor, retryPrompt, btnRetry };
}
