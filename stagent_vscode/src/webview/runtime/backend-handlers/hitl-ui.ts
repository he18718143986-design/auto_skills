import type { BackendMessage } from '../../../WorkflowDefinition';
import { execStore } from '../stores';
import { isDecisionStage } from '../shell';
import {
  renderDownstreamResetPanel,
  renderBeforeQuestionsCard,
} from '../view-exec';
import type { BackendMessageHandler } from './types';
import { getLastAppliedBackendSeq, resetStagesToPending, tryAdvanceBackendSeq } from '../stageStatusStore';
import { recordStageQuestionsSeq, shouldApplyStageQuestions } from '../stageQuestionsSeqGate';
import { scheduleUiRefresh } from '../uiRefreshScheduler';

const maps = execStore.stageMaps;

function handleStageQuestions(msg: Extract<BackendMessage, { type: 'stageQuestions' }>): void {
  if (!shouldApplyStageQuestions(msg.stageId, 'after', msg.seq, getLastAppliedBackendSeq())) {
    return;
  }
  // Always buffer so an out-of-order arrival (before the paused status update) is not lost;
  // the status-update handler re-renders from this buffer when the stage becomes paused.
  maps.afterQuestionsByStage[msg.stageId] = msg.questions || [];
  recordStageQuestionsSeq(msg.stageId, 'after', msg.seq);
  if (
    maps.stageStatus[msg.stageId] === 'paused' &&
    execStore.currentPausedStageId === msg.stageId &&
    !isDecisionStage(msg.stageId)
  ) {
    scheduleUiRefresh(['pauseBar']);
  }
  scheduleUiRefresh(['pauseBarVisibility']);
}

function handleStageQuestionsBefore(
  msg: Extract<BackendMessage, { type: 'stageQuestionsBefore' }>,
): void {
  if (!shouldApplyStageQuestions(msg.stageId, 'before', msg.seq, getLastAppliedBackendSeq())) {
    return;
  }
  maps.beforeQuestionsByStage[msg.stageId] = msg.questions || [];
  recordStageQuestionsSeq(msg.stageId, 'before', msg.seq);
  execStore.currentBeforeQuestionStageId = msg.stageId;
  renderBeforeQuestionsCard(msg.stageId, maps.beforeQuestionsByStage[msg.stageId]);
  scheduleUiRefresh(['pauseBarVisibility']);
}

function handleStageConfidenceUpdate(
  msg: Extract<BackendMessage, { type: 'stageConfidenceUpdate' }>,
): void {
  if (!tryAdvanceBackendSeq(msg.seq)) {
    return;
  }
  maps.stageConfidence[msg.stageId] = {
    score: Number(msg.score),
    level: msg.level || 'medium',
    reasons: Array.isArray(msg.reasons) ? msg.reasons : [],
  };
  scheduleUiRefresh(['timeline']);
}

function handleDownstreamReset(msg: Extract<BackendMessage, { type: 'downstreamReset' }>): void {
  const resetIds = Array.isArray(msg.resetStageIds)
    ? msg.resetStageIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];
  if (resetIds.length > 0) {
    if (!resetStagesToPending(resetIds, msg.seq)) {
      return;
    }
  } else if (!tryAdvanceBackendSeq(msg.seq)) {
    return;
  }
  renderDownstreamResetPanel(msg);
  scheduleUiRefresh(['timeline']);
}

function handleUpstreamFixStarted(msg: Extract<BackendMessage, { type: 'upstreamFixStarted' }>): void {
  const resetIds = Array.isArray(msg.resetStageIds)
    ? msg.resetStageIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];
  if (resetIds.length > 0) {
    if (!resetStagesToPending(resetIds, msg.seq)) {
      return;
    }
  } else if (!tryAdvanceBackendSeq(msg.seq)) {
    return;
  }
  renderDownstreamResetPanel({
    resetStageTitles: msg.resetStageTitles,
    titleMessageKey: 'stagent.webview.exec.upstreamFixResetTitle',
  });
  scheduleUiRefresh(['timeline']);
}

function handleStageArtifactHints(msg: Extract<BackendMessage, { type: 'stageArtifactHints' }>): void {
  if (!tryAdvanceBackendSeq(msg.seq)) {
    return;
  }
  maps.stageArtifacts[msg.stageId] = msg.artifacts || [];
  if (execStore.currentPausedStageId === msg.stageId) {
    scheduleUiRefresh(['pauseBar']);
  }
}

export const hitlUiHandlers: Record<string, BackendMessageHandler> = {
  stageQuestions: (msg) => handleStageQuestions(msg as Extract<BackendMessage, { type: 'stageQuestions' }>),
  stageQuestionsBefore: (msg) =>
    handleStageQuestionsBefore(msg as Extract<BackendMessage, { type: 'stageQuestionsBefore' }>),
  stageConfidenceUpdate: (msg) =>
    handleStageConfidenceUpdate(msg as Extract<BackendMessage, { type: 'stageConfidenceUpdate' }>),
  downstreamReset: (msg) =>
    handleDownstreamReset(msg as Extract<BackendMessage, { type: 'downstreamReset' }>),
  upstreamFixStarted: (msg) =>
    handleUpstreamFixStarted(msg as Extract<BackendMessage, { type: 'upstreamFixStarted' }>),
  stageArtifactHints: (msg) =>
    handleStageArtifactHints(msg as Extract<BackendMessage, { type: 'stageArtifactHints' }>),
};
