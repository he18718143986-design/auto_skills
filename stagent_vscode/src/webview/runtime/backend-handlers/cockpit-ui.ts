import type { BackendMessage } from '../../../WorkflowDefinition';
import {
  pushEngineActivity,
  setStageExecSemantic,
} from '../view-exec-cockpit';
import { setQualityReport } from '../view-quality-report';
import type { BackendMessageHandler } from './types';
import { tryAdvanceBackendSeq } from '../stageStatusStore';
import { scheduleUiRefresh } from '../uiRefreshScheduler';

function handleEngineActivity(msg: Extract<BackendMessage, { type: 'engineActivity' }>): void {
  if (!tryAdvanceBackendSeq(msg.seq)) {
    return;
  }
  pushEngineActivity({
    kind: msg.kind,
    text: msg.text,
    stageId: msg.stageId,
    timestamp: msg.timestamp,
  });
  scheduleUiRefresh(['cockpit']);
}

export const cockpitUiHandlers: Record<string, BackendMessageHandler> = {
  engineActivity: (msg) => handleEngineActivity(msg as Extract<BackendMessage, { type: 'engineActivity' }>),
};

export function applyQualityReportFromCompleted(
  msg: Extract<BackendMessage, { type: 'workflowCompleted' }>,
): void {
  setQualityReport(msg.qualityReport);
}
