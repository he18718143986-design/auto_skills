import type { BackendMessage } from '../../../WorkflowDefinition';
import { isGenerationTraceStageId } from '../../../generation/GenerationTraceStageIds';
import { wMsg } from '../../l10n/wMsg';
import { execStore } from '../stores';
import { isViewActive } from '../shell';
import {
  clearExecStageErrorUi,
  shouldLiveUpdateExecOutput,
  selectExecTimelineStage,
} from '../view-exec';
import { handleGenerationStreamChunk } from './generation';
import type { BackendMessageHandler } from './types';
import { patchStageStatus, tryAdvanceBackendSeq } from '../stageStatusStore';
import type { ExecStageStatus } from '../../shared/stageStatusPolicy';
import { scheduleUiRefresh, type UiRefreshContext, type UiRefreshTarget } from '../uiRefreshScheduler';

const maps = execStore.stageMaps;

function handleStageStatusUpdate(msg: Extract<BackendMessage, { type: 'stageStatusUpdate' }>): void {
  const { prev: prevStatus, status: effectiveStatus } = patchStageStatus(
    msg.stageId,
    msg.status as ExecStageStatus,
    msg.seq,
  );
  maps.retryDisabledByStage[msg.stageId] = effectiveStatus === 'paused' ? !!msg.retryDisabled : false;
  if (
    effectiveStatus === 'running' ||
    effectiveStatus === 'retrying' ||
    effectiveStatus === 'done' ||
    effectiveStatus === 'skipped' ||
    (prevStatus === 'error' && effectiveStatus !== 'error')
  ) {
    clearExecStageErrorUi();
  }
  if (effectiveStatus === 'running') {
    execStore.currentRunStageId = msg.stageId;
    maps.stageOutputs[msg.stageId] = '';
  }
  if (effectiveStatus === 'paused') {
    execStore.currentPausedStageId = msg.stageId;
  } else if (execStore.currentPausedStageId === msg.stageId) {
    execStore.currentPausedStageId = null;
  }
  if (effectiveStatus !== 'waiting-questions' && execStore.currentBeforeQuestionStageId === msg.stageId) {
    execStore.currentBeforeQuestionStageId = null;
    delete maps.beforeQuestionsByStage[msg.stageId];
  }
  const targets: UiRefreshTarget[] = ['pauseBar', 'outputVisibility', 'timeline'];
  const refreshContext: UiRefreshContext = {};
  if (effectiveStatus === 'running' && shouldLiveUpdateExecOutput(msg.stageId)) {
    targets.push('outputPanel');
    refreshContext.outputPanel = { stageId: msg.stageId };
  } else if (effectiveStatus !== 'running' && shouldLiveUpdateExecOutput(msg.stageId)) {
    targets.push('outputPanel');
    refreshContext.outputPanel = { stageId: execStore.execOutputPinnedStageId || msg.stageId };
  }
  scheduleUiRefresh(targets, refreshContext);
}

function handleDagWaveUpdate(msg: Extract<BackendMessage, { type: 'dagWaveUpdate' }>): void {
  if (!tryAdvanceBackendSeq(msg.seq)) {
    return;
  }
  execStore.dagWaveIndex = msg.waveIndex;
  execStore.dagWaveActiveStageIds = msg.phase === 'start' ? [...msg.activeStageIds] : [];
  if (isViewActive('view-exec')) {
    scheduleUiRefresh(['dagGraph'], { dagGraphSelect: selectExecTimelineStage });
  }
}

function handleLlmUsageUpdate(msg: Extract<BackendMessage, { type: 'llmUsageUpdate' }>): void {
  if (!tryAdvanceBackendSeq(msg.seq)) {
    return;
  }
  const add = msg.totalTokens ?? 0;
  if (add > 0) {
    execStore.llmUsageTotalTokens += add;
  }
  const foot = document.getElementById('llm-usage-footer');
  if (foot) {
    foot.textContent =
      execStore.llmUsageTotalTokens > 0
        ? wMsg('stagent.webview.exec.llmUsageEstimate', execStore.llmUsageTotalTokens)
        : '';
    foot.style.display = execStore.llmUsageTotalTokens > 0 ? 'block' : 'none';
  }
}

function handleExecStreamChunk(msg: Extract<BackendMessage, { type: 'streamChunk' }>): void {
  handleGenerationStreamChunk(msg);
  if (isGenerationTraceStageId(msg.stageId)) {
    return;
  }
  if (!tryAdvanceBackendSeq(msg.seq)) {
    return;
  }
  if (
    msg.stageId === execStore.currentRunStageId ||
    (Array.isArray(execStore.dagWaveActiveStageIds) &&
      execStore.dagWaveActiveStageIds.includes(msg.stageId))
  ) {
    const prev = maps.stageOutputs[msg.stageId] || '';
    maps.stageOutputs[msg.stageId] = prev + String(msg.chunk || '');
    if (shouldLiveUpdateExecOutput(msg.stageId)) {
      scheduleUiRefresh(['outputPanel'], { outputPanel: { stageId: msg.stageId } });
    }
  }
}

function handleStageOutputUpdate(msg: Extract<BackendMessage, { type: 'stageOutputUpdate' }>): void {
  if (!tryAdvanceBackendSeq(msg.seq)) {
    return;
  }
  maps.stageOutputs[msg.stageId] = String(msg.content ?? '');
  if (shouldLiveUpdateExecOutput(msg.stageId)) {
    scheduleUiRefresh(['outputPanel'], { outputPanel: { stageId: msg.stageId } });
  }
  if (msg.stageId === execStore.currentPausedStageId) {
    const editor = document.getElementById('decision-editor') as HTMLTextAreaElement | null;
    if (editor) {
      editor.value = maps.stageOutputs[msg.stageId];
    }
  }
}

export const executionUiHandlers: Record<string, BackendMessageHandler> = {
  stageStatusUpdate: (msg) =>
    handleStageStatusUpdate(msg as Extract<BackendMessage, { type: 'stageStatusUpdate' }>),
  dagWaveUpdate: (msg) => handleDagWaveUpdate(msg as Extract<BackendMessage, { type: 'dagWaveUpdate' }>),
  llmUsageUpdate: (msg) => handleLlmUsageUpdate(msg as Extract<BackendMessage, { type: 'llmUsageUpdate' }>),
  streamChunk: (msg) => handleExecStreamChunk(msg as Extract<BackendMessage, { type: 'streamChunk' }>),
  stageOutputUpdate: (msg) =>
    handleStageOutputUpdate(msg as Extract<BackendMessage, { type: 'stageOutputUpdate' }>),
};
