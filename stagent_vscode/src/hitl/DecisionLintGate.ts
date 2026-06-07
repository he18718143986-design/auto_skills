import type * as vscode from 'vscode';
import { uiMsg } from '../l10n/uiStrings';
import { evaluateDecisionContentLintGate } from '../DecisionRecordVerify';
import type { WorkflowDefinition } from '../WorkflowDefinition';
import { ERROR_TYPE_INVARIANT_VIOLATION } from '../WorkflowStageErrorHelpers';
import type {
  HitlDiagnosticsHost,
  HitlStateHost,
  HitlUiHost,
} from './HitlCoordinatorHost';
import { postHitlStageError } from './postHitlStageError';

export function evaluateApproveDecisionLintOrReject(
  host: HitlStateHost & HitlUiHost & HitlDiagnosticsHost,
  panel: vscode.WebviewPanel,
  stageId: string,
  definition: WorkflowDefinition,
  decisionRecord: string,
): boolean {
  const lintGate = evaluateDecisionContentLintGate(definition.globalConfig, decisionRecord, {
    vscodeDefault: host.isDecisionContentLintVscodeDefault(),
  });
  if (lintGate.outcome !== 'reject') {
    return true;
  }
  host.logUserAction('approve_decision_rejected', {
    stageId,
    violationCodes: lintGate.violationCodes,
  });
  postHitlStageError(
    host,
    panel,
    stageId,
    uiMsg('stagent.hitl.decisionLintRejected', lintGate.rejectionSummary ?? ''),
    ERROR_TYPE_INVARIANT_VIOLATION,
  );
  return false;
}
