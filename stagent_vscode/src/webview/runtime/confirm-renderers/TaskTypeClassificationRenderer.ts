import type { BackendMessage } from '../../../WorkflowDefinition';
import { KNOWN_TASK_TYPES } from '../../../TaskTypeResolution';
import {
  plainWorkflowTemplateLabel,
  WORKFLOW_TEMPLATES,
  type WorkflowTemplate,
} from '../../../path-router/WorkflowTemplateTypes';
import { wMsg } from '../../l10n/wMsg';
import { confirmStore } from '../stores';
import { escapeHtml, setConfirmSectionVisible } from '../shell';
import { renderConfirmFooter } from '../view-confirm';

type WorkflowGeneratedMsg = Extract<BackendMessage, { type: 'workflowGenerated' }>;

function syncTaskTypeControlsDisabled(): void {
  const locked = confirmStore.taskTypeLocked;
  const select = document.getElementById('task-type-select') as HTMLSelectElement | null;
  const templateSelect = document.getElementById('workflow-template-select') as HTMLSelectElement | null;
  const greenfield = document.getElementById('task-type-greenfield') as HTMLInputElement | null;
  if (select) {
    select.disabled = locked;
  }
  if (templateSelect) {
    templateSelect.disabled = locked;
  }
  if (greenfield) {
    greenfield.disabled = locked;
  }
}

function applyWorkflowTemplateToWorkflow(): void {
  if (!confirmStore.workflowDef?.meta) {
    return;
  }
  const templateSelect = document.getElementById('workflow-template-select') as HTMLSelectElement | null;
  if (templateSelect?.value) {
    confirmStore.workflowDef.meta.workflowTemplate = templateSelect.value;
    if (templateSelect.value === 'greenfield_full') {
      confirmStore.workflowDef.meta.isGreenfield = true;
    } else if (templateSelect.value === 'brownfield_full' || templateSelect.value === 'arch_review') {
      confirmStore.workflowDef.meta.isGreenfield = false;
    }
  }
  renderConfirmFooter();
}

function applyTaskTypeToWorkflow(): void {
  if (!confirmStore.workflowDef?.meta) {
    return;
  }
  const select = document.getElementById('task-type-select') as HTMLSelectElement | null;
  const greenfield = document.getElementById('task-type-greenfield') as HTMLInputElement | null;
  if (select?.value) {
    confirmStore.workflowDef.meta.taskType = select.value;
  }
  if (greenfield) {
    confirmStore.workflowDef.meta.isGreenfield = greenfield.checked;
  }
  renderConfirmFooter();
}

export function applyTaskTypeClassificationFromMessage(msg: WorkflowGeneratedMsg): void {
  confirmStore.taskTypeClassification = msg.taskTypeClassification ?? null;
  confirmStore.taskTypeLocked = false;
}

export function renderTaskTypeClassification(): void {
  const section = document.getElementById('section-task-type-classification');
  const rationaleEl = document.getElementById('task-type-rationale');
  const select = document.getElementById('task-type-select') as HTMLSelectElement | null;
  const greenfield = document.getElementById('task-type-greenfield') as HTMLInputElement | null;
  const lock = document.getElementById('task-type-lock') as HTMLInputElement | null;
  const templateSelect = document.getElementById('workflow-template-select') as HTMLSelectElement | null;
  const pathEl = document.getElementById('task-type-path');
  const effectiveEl = document.getElementById('task-type-effective');

  if (!section || !rationaleEl || !select || !greenfield || !lock || !effectiveEl || !pathEl || !templateSelect) {
    return;
  }

  const info = confirmStore.taskTypeClassification;
  if (!info || !confirmStore.workflowDef?.meta) {
    setConfirmSectionVisible('section-task-type-classification', false);
    return;
  }

  setConfirmSectionVisible('section-task-type-classification', true);

  let rationaleHtml = '<ul class="task-type-rationale-list">';
  for (const line of info.rationaleLines) {
    rationaleHtml += '<li>' + escapeHtml(line) + '</li>';
  }
  rationaleHtml += '</ul>';
  rationaleEl.innerHTML = rationaleHtml;

  const currentType = confirmStore.workflowDef.meta.taskType || info.effectiveTaskType;
  select.innerHTML = '';
  for (const t of KNOWN_TASK_TYPES) {
    const opt = document.createElement('option');
    opt.value = t;
    const plainKey = 'stagent.webview.confirm.taskTypePlain.' + t;
    const plain = wMsg(plainKey);
    opt.textContent = plain !== plainKey ? plain : t;
    if (t === currentType) {
      opt.selected = true;
    }
    select.appendChild(opt);
  }

  greenfield.checked = confirmStore.workflowDef.meta.isGreenfield === true;
  lock.checked = confirmStore.taskTypeLocked;

  const currentTemplate =
    (confirmStore.workflowDef.meta.workflowTemplate as WorkflowTemplate | undefined) ??
    info.workflowTemplate ??
    info.suggestedWorkflowTemplate;
  templateSelect.innerHTML = '';
  for (const t of WORKFLOW_TEMPLATES) {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = plainWorkflowTemplateLabel(t);
    if (t === currentTemplate) {
      opt.selected = true;
    }
    templateSelect.appendChild(opt);
  }

  const pathTemplate = currentTemplate ? plainWorkflowTemplateLabel(currentTemplate) : '';
  const suggestHint =
    info.suggestedWorkflowTemplate &&
    info.suggestedWorkflowTemplate !== currentTemplate
      ? wMsg(
          'stagent.webview.confirm.workflowTemplateModelHint',
          plainWorkflowTemplateLabel(info.suggestedWorkflowTemplate),
        )
      : '';
  pathEl.textContent = pathTemplate
    ? wMsg('stagent.webview.confirm.workflowTemplateEffective', pathTemplate) +
      (suggestHint ? ' · ' + suggestHint : '')
    : '';

  const modelHint =
    info.modelTaskType && info.modelTaskType !== currentType
      ? wMsg('stagent.webview.confirm.taskTypeModelHint', info.modelTaskType)
      : '';
  const plainCurrent =
    info.effectiveTaskTypePlain && info.effectiveTaskType === currentType
      ? info.effectiveTaskTypePlain
      : currentType;
  effectiveEl.textContent = wMsg(
    'stagent.webview.confirm.taskTypeEffective',
    plainCurrent,
    confirmStore.workflowDef.meta.isGreenfield === true
      ? wMsg('stagent.webview.confirm.greenfieldYes')
      : wMsg('stagent.webview.confirm.greenfieldNo'),
  ) + (modelHint ? ' · ' + modelHint : '');

  syncTaskTypeControlsDisabled();
}

export function registerTaskTypeClassificationControls(): void {
  const select = document.getElementById('task-type-select');
  const templateSelect = document.getElementById('workflow-template-select');
  const greenfield = document.getElementById('task-type-greenfield');
  const lock = document.getElementById('task-type-lock');

  templateSelect?.addEventListener('change', () => {
    if (!confirmStore.taskTypeLocked) {
      applyWorkflowTemplateToWorkflow();
      renderTaskTypeClassification();
    }
  });
  select?.addEventListener('change', () => {
    if (!confirmStore.taskTypeLocked) {
      applyTaskTypeToWorkflow();
      renderTaskTypeClassification();
    }
  });
  greenfield?.addEventListener('change', () => {
    if (!confirmStore.taskTypeLocked) {
      applyTaskTypeToWorkflow();
      renderTaskTypeClassification();
    }
  });
  lock?.addEventListener('change', () => {
    confirmStore.taskTypeLocked = (lock as HTMLInputElement).checked;
    syncTaskTypeControlsDisabled();
  });
}
