import { wMsg } from '../../l10n/wMsg';
import { confirmStore } from '../stores';
import { approvedDecisionCount } from '../shell';
import { appendDecisionConflictBanner } from './DecisionConflictBanner';
import { wireDecisionPauseBarControls } from './DecisionPauseBarControls';

export function renderDecisionPauseBar(ctx: PauseBarShellContext): void {
  const { scroll, stageId, outputText } = ctx;

  document.getElementById('output-label')!.textContent = wMsg('stagent.webview.pause.decisionReviewLabel', stageId);
  const title = document.createElement('div');
  title.textContent = wMsg('stagent.webview.pause.decisionIntro');
  title.className = 'muted';
  scroll.appendChild(title);

  if (shouldShowPlanReviewChecklist(confirmStore.workflowDef, stageId, confirmStore.workflowWarnings, confirmStore.planSummary)) {
    const planPanel = document.createElement('div');
    planPanel.className = 'plan-review-panel';
    planPanel.textContent = buildPlanReviewChecklistLines(confirmStore.workflowDef, confirmStore.planSummary, confirmStore.workflowWarnings).join('\n');
    scroll.appendChild(planPanel);
  }

  let decisionSummaryEl: HTMLElement | null = null;
  if (shouldShowDecisionConflictBanner(approvedDecisionCount())) {
    decisionSummaryEl = appendDecisionConflictBanner(scroll);
  }

  wireDecisionPauseBarControls(ctx, decisionSummaryEl);
}
