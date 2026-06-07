import { wMsg } from '../l10n/wMsg';
import {
  GENERATION_OPERATION_POLISH,
  GENERATION_OPERATION_WORKFLOW,
} from '../../generation/GenerationOperationIds';
import {
  FRONTEND_MSG_CLARIFY_START,
  FRONTEND_MSG_GENERATE_WORKFLOW,
  FRONTEND_MSG_PICK_TASK_WORKSPACE_FOLDER,
  FRONTEND_MSG_POLISH_USER_TASK,
} from '../../workflow/FrontendMessageTypes';
import { DEFAULT_TASK_TYPE, inputStore } from './stores';
import { vscode } from './vscode-api';

export function renderGenStatusDetail() {
  document.getElementById('gen-status-detail').textContent =
    inputStore.genStatusDetailBase + formatStreamCharSuffix(inputStore.genStreamChars);
}

export function setInputPageBusy(op, title, detail) {
  inputStore.inputBusyOp = op;
  inputStore.genStreamChars = 0;
  inputStore.genStatusDetailBase = detail || '';
  document.getElementById('polish-assistant').style.display = 'none';
  const panel = document.getElementById('gen-status-panel');
  const stream = document.getElementById('gen-stream');
  panel.style.display = 'flex';
  panel.classList.remove('error');
  document.getElementById('gen-status-spinner').style.display = '';
  document.getElementById('gen-status-title').textContent = title || wMsg('stagent.webview.main.processing');
  renderGenStatusDetail();
  stream.textContent = '';
  document.getElementById('btn-gen').disabled = true;
  document.getElementById('btn-polish').disabled = true;
  syncInputActionsVisibility();
  scrollChatPanelToBottom();
}

export function updateInputPageProgress(message, detail) {
  const panel = document.getElementById('gen-status-panel');
  if (panel.style.display === 'none') {
    setInputPageBusy(inputStore.inputBusyOp || GENERATION_OPERATION_WORKFLOW, message, detail);
    return;
  }
  if (message) document.getElementById('gen-status-title').textContent = message;
  if (typeof detail === 'string' && detail.length > 0) {
    inputStore.genStatusDetailBase = detail;
  }
  renderGenStatusDetail();
}

export function clearInputPageBusy() {
  inputStore.inputBusyOp = null;
  inputStore.genStreamChars = 0;
  inputStore.genStatusDetailBase = '';
  document.getElementById('btn-gen').disabled = false;
  document.getElementById('btn-polish').disabled = false;
  document.getElementById('gen-status-panel').style.display = 'none';
  document.getElementById('gen-status-panel').classList.remove('error');
  document.getElementById('gen-stream').textContent = '';
  syncInputActionsVisibility();
}

export function showInputPageError(reason) {
  inputStore.inputBusyOp = null;
  document.getElementById('btn-gen').disabled = false;
  document.getElementById('btn-polish').disabled = false;
  document.getElementById('polish-assistant').style.display = 'none';
  const panel = document.getElementById('gen-status-panel');
  panel.style.display = 'flex';
  panel.classList.add('error');
  document.getElementById('gen-status-spinner').style.display = 'none';
  document.getElementById('gen-status-title').textContent = wMsg('stagent.webview.input.processFailed');
  document.getElementById('gen-status-detail').textContent = reason || wMsg('stagent.webview.input.unknownError');
  document.getElementById('composer-dock').style.display = '';
  syncInputActionsVisibility();
}

export function isInputReady() {
  return (
    document.getElementById('user-input').value.trim().length > 0 &&
    document.getElementById('task-workspace-path').value.trim().length > 0
  );
}

export function isPolishReadyForGenerate() {
  const edit = document.getElementById('polish-result-edit');
  return (
    edit.style.display !== 'none' &&
    edit.value.trim().length > 0 &&
    document.getElementById('task-workspace-path').value.trim().length > 0
  );
}

export function startWorkflowGeneration(userInput) {
  const trimmed = String(userInput || '').trim();
  const taskWorkspacePath = document.getElementById('task-workspace-path').value.trim();
  if (!trimmed || !taskWorkspacePath) {
    return;
  }
  document.getElementById('polish-assistant').style.display = 'none';
  commitUserMessage(trimmed);
  inputStore.pendingClarifyInput = trimmed;
  setInputPageBusy(GENERATION_OPERATION_WORKFLOW, wMsg('stagent.webview.input.analyzingRequirement'), wMsg('stagent.webview.input.scanningWorkspace'));
  vscode.postMessage({
    type: FRONTEND_MSG_CLARIFY_START,
    userInput: trimmed,
    taskType: DEFAULT_TASK_TYPE,
    taskWorkspacePath,
  });
}

export function isGenErrorVisible() {
  const panel = document.getElementById('gen-status-panel');
  return panel.style.display !== 'none' && panel.classList.contains('error');
}

export function syncInputActionsVisibility() {
  const dock = document.getElementById('composer-dock');
  const inputActions = document.getElementById('input-actions');
  const polishActions = document.getElementById('polish-actions');
  const genActions = document.getElementById('gen-actions');
  const btnGen = document.getElementById('btn-gen');
  const btnApply = document.getElementById('btn-polish-apply');
  const polishHint = document.getElementById('polish-dock-hint');
  const genHint = document.getElementById('gen-dock-hint');

  if (isPolishAssistantVisible()) {
    dock.style.display = '';
    dock.classList.remove('gen-error-mode');
    dock.classList.add('polish-mode');
    genActions.style.display = 'none';
    inputActions.style.display = 'none';
    polishActions.style.display = 'flex';
    btnApply.disabled = inputStore.inputBusyOp === GENERATION_OPERATION_POLISH || !isPolishReadyForGenerate();
    if (polishHint) {
      const edit = document.getElementById('polish-result-edit');
      polishHint.textContent =
        inputStore.inputBusyOp === GENERATION_OPERATION_POLISH
          ? wMsg('stagent.webview.main.polishing')
          : edit.style.display === 'none'
            ? wMsg('stagent.webview.input.polishFailedRetry')
            : wMsg('stagent.webview.main.polishDockHint');
    }
    return;
  }

  if (isGenErrorVisible()) {
    dock.style.display = '';
    dock.classList.remove('polish-mode');
    dock.classList.add('gen-error-mode');
    inputActions.style.display = 'none';
    polishActions.style.display = 'none';
    genActions.style.display = 'flex';
    if (genHint) {
      const reason = document.getElementById('gen-status-detail').textContent || '';
      genHint.textContent = reason ? reason : wMsg('stagent.webview.input.genFailedRetry');
    }
    return;
  }

  dock.classList.remove('polish-mode', 'gen-error-mode');
  polishActions.style.display = 'none';
  genActions.style.display = 'none';
  inputActions.style.display = 'flex';
  const ready = isInputReady();
  if (!inputStore.inputBusyOp) {
    btnGen.disabled = !ready;
  }
  btnGen.title = ready ? '' : wMsg('stagent.webview.input.fillRequiredTitle');
}

export function scrollChatPanelToBottom() {
  const scroll = document.getElementById('input-view-scroll');
  if (scroll) {
    scroll.scrollTop = scroll.scrollHeight;
  }
}

export function syncTextareaHeight(el) {
  if (!el || el.style.display === 'none') {
    return;
  }
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

export function syncPolishResultHeight() {
  const edit = document.getElementById('polish-result-edit');
  syncTextareaHeight(edit);
  requestAnimationFrame(() => {
    syncTextareaHeight(edit);
    scrollChatPanelToBottom();
  });
}

export function syncComposerInputHeight() {
  const input = document.getElementById('user-input');
  syncTextareaHeight(input);
  requestAnimationFrame(() => syncTextareaHeight(input));
}

export function commitUserMessage(text) {
  inputStore.committedUserText = text;
  document.getElementById('user-message-bubble').textContent = text;
  const history = document.getElementById('chat-history');
  history.style.display = 'flex';
  document.getElementById('composer-dock').style.display = 'none';
  scrollChatPanelToBottom();
}

export function showComposer(text, keepHistory) {
  const restore =
    typeof text === 'string'
      ? text
      : inputStore.committedUserText || document.getElementById('user-input').value;
  if (!keepHistory) {
    document.getElementById('chat-history').style.display = 'none';
    document.getElementById('polish-assistant').style.display = 'none';
    document.getElementById('gen-status-panel').style.display = 'none';
    document.getElementById('gen-status-panel').classList.remove('error');
    inputStore.committedUserText = '';
  } else {
    document.getElementById('polish-assistant').style.display = 'none';
    document.getElementById('gen-status-panel').style.display = 'none';
    document.getElementById('gen-status-panel').classList.remove('error');
  }
  document.getElementById('composer-dock').style.display = '';
  document.getElementById('user-input').value = restore;
  syncComposerInputHeight();
  syncInputActionsVisibility();
}

export function isPolishAssistantVisible() {
  return document.getElementById('polish-assistant').style.display !== 'none';
}

export function openPolishPanel(originalText) {
  inputStore.polishOriginalDraft = originalText;
  inputStore.inputBusyOp = GENERATION_OPERATION_POLISH;
  document.getElementById('gen-status-panel').style.display = 'none';
  commitUserMessage(originalText);
  document.getElementById('polish-result-edit').value = '';
  document.getElementById('polish-result-edit').style.display = 'none';
  document.getElementById('polish-loading').style.display = 'flex';
  document.getElementById('polish-loading-text').textContent = wMsg('stagent.webview.main.polishing');
  document.getElementById('polish-inline-error').style.display = 'none';
  document.getElementById('polish-inline-error').textContent = '';
  document.getElementById('btn-polish-apply').disabled = true;
  document.getElementById('polish-assistant').style.display = 'flex';
  syncInputActionsVisibility();
  scrollChatPanelToBottom();
}

export function closePolishPanel() {
  document.getElementById('polish-assistant').style.display = 'none';
  syncInputActionsVisibility();
  showComposer(inputStore.polishOriginalDraft);
  if (inputStore.inputBusyOp === GENERATION_OPERATION_POLISH) {
    inputStore.inputBusyOp = null;
  }
}

export function showPolishResult(text, fromCache) {
  document.getElementById('polish-loading').style.display = 'none';
  const edit = document.getElementById('polish-result-edit');
  edit.style.display = 'block';
  edit.value = text || '';
  if (fromCache) {
    document.getElementById('polish-loading-text').textContent = wMsg('stagent.webview.input.usedMemoryCache');
  }
  inputStore.inputBusyOp = null;
  syncPolishResultHeight();
  syncInputActionsVisibility();
}

export function showPolishPanelError(reason) {
  document.getElementById('polish-loading').style.display = 'none';
  document.getElementById('polish-result-edit').style.display = 'none';
  const err = document.getElementById('polish-inline-error');
  err.textContent = reason || wMsg('stagent.webview.input.polishFailed');
  err.style.display = 'block';
  inputStore.inputBusyOp = null;
  syncInputActionsVisibility();
}

export function sendGenerateWorkflow(userInput, clarifyAnswers) {
  const taskWorkspacePath = document.getElementById('task-workspace-path').value.trim();
  document.getElementById('polish-assistant').style.display = 'none';
  setInputPageBusy(
    GENERATION_OPERATION_WORKFLOW,
    wMsg('stagent.webview.input.generatingWorkflow'),
    wMsg('stagent.webview.input.submitPreparing'),
  );
  const payload = {
    type: FRONTEND_MSG_GENERATE_WORKFLOW,
    userInput,
    taskType: DEFAULT_TASK_TYPE,
    taskWorkspacePath,
  };
  if (inputStore.lastPolishContext) {
    payload.polishContext = inputStore.lastPolishContext;
  }
  if (clarifyAnswers && Object.keys(clarifyAnswers).length > 0) {
    payload.clarifyAnswers = clarifyAnswers;
  }
  vscode.postMessage(payload);
}

export function registerInputView(): void {
  document.getElementById('btn-pick-workspace')!.onclick = () => {
    vscode.postMessage({ type: FRONTEND_MSG_PICK_TASK_WORKSPACE_FOLDER });
  };
  document.getElementById('user-input')!.addEventListener('input', () => {
    syncComposerInputHeight();
    syncInputActionsVisibility();
  });
  document.getElementById('task-workspace-path')!.addEventListener('input', syncInputActionsVisibility);
  document.getElementById('btn-polish-collapse')!.onclick = () => closePolishPanel();
  document.getElementById('btn-edit-message')!.onclick = () => {
    showComposer(inputStore.committedUserText, true);
    inputStore.inputBusyOp = null;
    syncInputActionsVisibility();
  };
  document.getElementById('btn-polish-apply')!.onclick = () => {
    if (!isPolishReadyForGenerate()) return;
    const polished = (document.getElementById('polish-result-edit') as HTMLTextAreaElement).value.trim();
    inputStore.lastPolishContext = { originalDraft: inputStore.polishOriginalDraft, polishedAt: new Date().toISOString() };
    inputStore.inputBusyOp = null;
    startWorkflowGeneration(polished);
    scrollChatPanelToBottom();
  };
  document.getElementById('polish-result-edit')!.addEventListener('input', () => {
    syncPolishResultHeight();
    syncInputActionsVisibility();
  });
  document.getElementById('btn-polish')!.onclick = () => {
    const draft = (document.getElementById('user-input') as HTMLTextAreaElement).value.trim();
    if (!isInputReady() || !draft) return;
    openPolishPanel(draft);
    const taskWorkspacePath = (document.getElementById('task-workspace-path') as HTMLInputElement).value.trim();
    vscode.postMessage({
      type: FRONTEND_MSG_POLISH_USER_TASK,
      draft,
      taskType: DEFAULT_TASK_TYPE,
      ...(taskWorkspacePath ? { taskWorkspacePath } : {}),
    });
  };
  document.getElementById('btn-gen')!.onclick = () => {
    const userInput = (document.getElementById('user-input') as HTMLTextAreaElement).value.trim();
    if (!isInputReady()) return;
    startWorkflowGeneration(userInput);
  };
  const btnRegen = document.getElementById('btn-regenerate');
  if (btnRegen) {
    btnRegen.onclick = () => {
      const userInput = (inputStore.committedUserText || (document.getElementById('user-input') as HTMLTextAreaElement).value).trim();
      if (!userInput || !(document.getElementById('task-workspace-path') as HTMLInputElement).value.trim()) return;
      sendGenerateWorkflow(userInput);
    };
  }
}
