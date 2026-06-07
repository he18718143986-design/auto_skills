import type { WorkflowDefinition } from './WorkflowDefinition';
import { listDecisionRetryResetStageIds } from './WorkflowStateTransitions';
import { resolveWebviewString } from './webview/l10n/resolveWebviewString';

export function shouldShowQualitySoftPrompt(totalChecks: number, checkedCount: number): boolean {
  if (totalChecks <= 0) {
    return false;
  }
  return checkedCount < totalChecks;
}

export function getUncheckedCount(totalChecks: number, checkedCount: number): number {
  return Math.max(0, totalChecks - checkedCount);
}

export function shouldShowDecisionConflictBanner(approvedDecisionCount: number): boolean {
  return approvedDecisionCount >= 2;
}

export type DecisionApproveAction = 'approve-now' | 'show-soft-prompt';

export function getDecisionApproveAction(totalChecks: number, checkedCount: number): DecisionApproveAction {
  return shouldShowQualitySoftPrompt(totalChecks, checkedCount) ? 'show-soft-prompt' : 'approve-now';
}

export function shouldAskRetryConfirm(approvedDecisionCount: number): boolean {
  return approvedDecisionCount >= 1;
}

export function canProceedRetry(approvedDecisionCount: number, userConfirmed: boolean): boolean {
  if (!shouldAskRetryConfirm(approvedDecisionCount)) {
    return true;
  }
  return userConfirmed;
}

/** Webview：决策重试确认前，统计将被重置的下游阶段数（与引擎 collectDecisionRetryResets 一致）。 */
export function countDecisionRetryDownstreamStages(
  definition: WorkflowDefinition,
  decisionStageId: string,
): number {
  const idx = definition.stages.findIndex((s) => s.id === decisionStageId);
  if (idx < 0) {
    return 0;
  }
  return listDecisionRetryResetStageIds(definition, decisionStageId, idx).length;
}

export function formatDecisionRetryConfirmMessage(downstreamCount: number): string {
  if (downstreamCount <= 0) {
    return resolveWebviewString('stagent.webview.pause.decisionRetryClear');
  }
  return resolveWebviewString('stagent.webview.pause.decisionRetryDownstream', downstreamCount);
}
