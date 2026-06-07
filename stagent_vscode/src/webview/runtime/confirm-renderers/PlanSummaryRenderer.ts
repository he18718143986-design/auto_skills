import type { BackendMessage } from '../../../WorkflowDefinition';
import { confirmStore } from '../stores';
import { setConfirmSectionVisible } from '../shell';

type WorkflowGeneratedMsg = Extract<BackendMessage, { type: 'workflowGenerated' }>;

export function renderPlanSummaryAndDiff(_msg: WorkflowGeneratedMsg): void {
  const summaryEl = document.getElementById('plan-summary')!;
  const diffEl = document.getElementById('plan-diff')!;
  const newIds = (confirmStore.workflowDef!.stages || []).map((st: { id: string }) => st.id);
  const hadPrevious = confirmStore.lastGeneratedStageIds.length > 0;
  const diff = computePlanStageDiff(confirmStore.lastGeneratedStageIds, newIds);
  confirmStore.lastGeneratedStageIds = newIds;
  if (confirmStore.planSummary) {
    summaryEl.textContent = formatPlanSummaryLines(confirmStore.planSummary).join('\n');
    setConfirmSectionVisible('section-plan-summary', true);
  } else {
    summaryEl.textContent = '';
    setConfirmSectionVisible('section-plan-summary', false);
  }
  const diffLines = formatPlanStageDiffLines(diff, hadPrevious);
  if (diffLines.length) {
    diffEl.textContent = diffLines.join('\n');
    setConfirmSectionVisible('section-plan-diff', true);
  } else {
    diffEl.textContent = '';
    setConfirmSectionVisible('section-plan-diff', false);
  }
}
