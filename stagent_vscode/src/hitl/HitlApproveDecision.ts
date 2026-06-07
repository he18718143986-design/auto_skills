import type * as vscode from 'vscode';
import { describeApproveDecisionRejection } from '../ApproveDecisionGate';
import { markDecisionApproved } from '../WorkflowStateTransitions';
import { emitStageDoneAdvancePersist } from '../WorkflowEngineContinuation';
import { primaryOutputKey } from '../WorkflowInputContent';
import { evaluateApproveDecisionLintOrReject } from './DecisionLintGate';
import {
  ensureDecisionRecordOutput,
  scheduleDecisionApprovePersistence,
} from './DecisionApprovePersistence';
import type { HitlCoordinatorHost } from './HitlCoordinatorHost';
import { findHitlStage } from './resolveHitlStage';

export async function handleApproveDecision(
  host: HitlCoordinatorHost,
  stageId: string,
  decisionRecord: string,
  panel: vscode.WebviewPanel,
  instanceKey?: string,
): Promise<void> {
  host.bindPanel(panel);
  if (!host.ensureInstanceBound(instanceKey, panel)) {
    return;
  }
  const instance = host.getInstance();
  if (!instance) {
    host.rejectApproveDecision(panel, stageId, '未绑定任务实例，请从侧栏重新打开该任务后再批准决策。');
    return;
  }
  const binding = findHitlStage(instance, stageId);
  const idx = binding?.idx ?? -1;
  const rt = binding?.rt;
  const stage = binding?.stage;
  const gateReason = describeApproveDecisionRejection({
    hasInstance: true,
    stageFound: idx >= 0,
    stageIndex: idx,
    currentStageIndex: instance.currentStageIndex,
    isDecisionStage: stage?.isDecisionStage === true,
    status: rt?.status ?? 'pending',
  });
  if (gateReason) {
    host.rejectApproveDecision(panel, stageId, gateReason);
    return;
  }
  if (!stage || !rt) {
    return;
  }

  if (!evaluateApproveDecisionLintOrReject(host, panel, stageId, instance.definition, decisionRecord)) {
    return;
  }

  host.logUserAction('approve_decision', { stageId, decisionChars: decisionRecord.length });
  markDecisionApproved(
    stage,
    rt,
    decisionRecord,
    String(rt.outputs[primaryOutputKey(stage)] ?? ''),
    new Date().toISOString(),
  );

  scheduleDecisionApprovePersistence(host, stage, rt, decisionRecord);
  ensureDecisionRecordOutput(host, rt, stageId, decisionRecord);

  emitStageDoneAdvancePersist({
    emit: (msg) => host.postMessage(panel, msg),
    stageId,
    decisionUiFlag: true,
    bumpStageIndex: () => host.bumpCurrentStageIndex(),
    scheduleSave: () => host.scheduleSave(),
  });
  host.persistMilestone();
  await host.executeNextStage(panel);
}
