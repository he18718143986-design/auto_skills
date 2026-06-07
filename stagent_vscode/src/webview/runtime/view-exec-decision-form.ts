import { wMsg } from '../l10n/wMsg';
import { confirmStore, execStore } from './stores';

const maps = execStore.stageMaps;
import { vscode } from './vscode-api';
import { resetPauseBarShell } from './view-exec-output-panel';

export { renderPauseBar } from './pause-bar/index';
export {
  collectArtifactHintsForStage,
  appendStageArtifactActions,
} from './pause-bar/artifact-actions';
export function getQuestionAfter(stageId) {
  const st = confirmStore.workflowDef?.stages?.find((s) => s.id === stageId);
  return st?.questionAfter ?? [];
}

export function collectAnswersFromQuestionFields(fields) {
  const answers = {};
  for (const f of fields) {
    answers[f.qId] = f.input.value || '';
  }
  return answers;
}

export function applyQuestionValidationUi(bar, questions, missingIds, fields) {
  let banner = bar.querySelector('#question-validation-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'question-validation-banner';
    banner.className = 'question-validation-banner';
    banner.setAttribute('role', 'alert');
    const titleEl = bar.querySelector('.muted');
    if (titleEl && titleEl.nextSibling) {
      bar.insertBefore(banner, titleEl.nextSibling);
    } else {
      bar.insertBefore(banner, bar.firstChild);
    }
  }
  const missingSet = new Set(missingIds);
  if (missingIds.length === 0) {
    banner.style.display = 'none';
    banner.textContent = '';
    for (const f of fields) {
      f.block.classList.remove('question-field-invalid');
      f.input.removeAttribute('aria-invalid');
    }
    return;
  }
  banner.style.display = 'block';
  banner.textContent = formatRequiredAnswersValidationError(questions, missingIds);
  for (const f of fields) {
    const invalid = missingSet.has(f.qId);
    f.block.classList.toggle('question-field-invalid', invalid);
    if (invalid) {
      f.input.setAttribute('aria-invalid', 'true');
    } else {
      f.input.removeAttribute('aria-invalid');
    }
  }
}

export function renderQuestionsFormInPauseBar(opts) {
  const {
    stageId,
    questions,
    outputLabel,
    introText,
    submitLabel,
    idFallbackPrefix,
    buildSubmitMessage,
  } = opts;
  const { scroll, dock } = resetPauseBarShell();
  document.getElementById('output-label').textContent = outputLabel;

  const title = document.createElement('div');
  title.className = 'muted';
  title.textContent = introText;
  scroll.appendChild(title);

  const fields = [];
  (questions || []).forEach((q, idx) => {
    const qId = String(q.id || idFallbackPrefix + (idx + 1));
    const qText = String(
      q.text || q.question || q.prompt || q.title || q.hint || wMsg('stagent.webview.exec.questionFallback', idx + 1),
    );
    const block = document.createElement('div');
    block.className = 'question-field';
    block.style.marginTop = '10px';
    block.dataset.qid = qId;

    const qTitle = document.createElement('div');
    qTitle.textContent = wMsg('stagent.webview.exec.questionTitle', idx + 1, qText) + (q.required === false ? '' : ' *');
    block.appendChild(qTitle);

    if (q.hint) {
      const hint = document.createElement('div');
      hint.className = 'muted';
      hint.textContent = '💡 ' + q.hint;
      block.appendChild(hint);
    }

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = q.hint || wMsg('stagent.webview.exec.answerPlaceholder');
    block.appendChild(input);
    scroll.appendChild(block);
    fields.push({ qId, block, input });
  });

  const clearValidationOnInput = () => {
    const banner = scroll.querySelector('#question-validation-banner');
    if (!banner || banner.style.display === 'none') {
      return;
    }
    const check = validateRequiredAnswers(questions, collectAnswersFromQuestionFields(fields));
    applyQuestionValidationUi(scroll, questions, check.ok ? [] : check.missingIds, fields);
  };
  for (const f of fields) {
    f.input.addEventListener('input', clearValidationOnInput);
  }

  const btn = document.createElement('button');
  btn.className = 'dock-primary';
  btn.textContent = submitLabel;
  btn.onclick = () => {
    const answers = collectAnswersFromQuestionFields(fields);
    const check = validateRequiredAnswers(questions, answers);
    if (!check.ok) {
      applyQuestionValidationUi(scroll, questions, check.missingIds, fields);
      const first = fields.find((f) => check.missingIds.includes(f.qId));
      if (first) {
        first.input.focus();
      }
      return;
    }
    applyQuestionValidationUi(scroll, questions, [], fields);
    vscode.postMessage(buildSubmitMessage(stageId, answers));
  };
  dock.appendChild(btn);
}

export function renderAfterQuestionsCard(stageId, questions) {
  renderQuestionsFormInPauseBar({
    stageId,
    questions,
    outputLabel: wMsg('stagent.webview.exec.outputAfterLabel', stageId),
    introText: wMsg('stagent.webview.exec.afterIntro'),
    submitLabel: wMsg('stagent.webview.exec.afterSubmit'),
    idFallbackPrefix: 'after_q_',
    buildSubmitMessage: buildAnswerQuestionsMessage,
  });
}

export function renderBeforeQuestionsCard(stageId, questions) {
  renderQuestionsFormInPauseBar({
    stageId,
    questions,
    outputLabel: wMsg('stagent.webview.exec.outputBeforeLabel', stageId),
    introText: wMsg('stagent.webview.exec.beforeIntro'),
    submitLabel: wMsg('stagent.webview.exec.beforeSubmit'),
    idFallbackPrefix: 'before_q_',
    buildSubmitMessage: buildAnswerQuestionsBeforeMessage,
  });
}

export { renderDecisionChecklist } from './pause-bar/decision-checklist';
