import { confirmStore, execStore } from './stores';

const maps = execStore.stageMaps;

export function isViewActive(viewId: string): boolean {
  const el = document.getElementById(viewId);
  if (!el) return false;
  if (el.classList && typeof el.classList.contains === 'function') {
    return el.classList.contains('active');
  }
  return String((el as HTMLElement).className || '').split(/\s+/).includes('active');
}

export const isDecisionStage = (stageId) =>
  !!confirmStore.workflowDef?.stages?.find((st) => st.id === stageId)?.isDecisionStage;

export const approvedDecisionCount = () =>
  (confirmStore.workflowDef?.stages ?? []).filter(
    (st) => st.isDecisionStage && maps.stageStatus[st.id] === 'done',
  ).length;

export function setConfirmSectionVisible(sectionId, visible) {
  const section = document.getElementById(sectionId);
  if (section) {
    section.hidden = !visible;
  }
}

export function syncWorkflowSteps(view) {
  const order = ['input', 'confirm', 'exec'];
  const idx = order.indexOf(view);
  document.querySelectorAll('.workflow-step').forEach((btn) => {
    const step = btn.getAttribute('data-step');
    const si = order.indexOf(step);
    btn.classList.remove('active', 'done', 'pending');
    if (si < idx) {
      btn.classList.add('done');
    } else if (si === idx) {
      btn.classList.add('active');
    } else {
      btn.classList.add('pending');
    }
    let canNav = false;
    if (view === 'confirm' && step === 'input') {
      canNav = true;
    }
    if (view === 'exec' && (step === 'input' || step === 'confirm')) {
      canNav = true;
    }
    btn.disabled = !canNav;
  });
}

export function show(view) {
  document.getElementById('view-input')!.classList.toggle('active', view === 'input');
  document.getElementById('view-confirm')!.classList.toggle('active', view === 'confirm');
  document.getElementById('view-exec')!.classList.toggle('active', view === 'exec');
  syncWorkflowSteps(view);
}

export { escapeHtml } from '../shared/escapeHtml';
