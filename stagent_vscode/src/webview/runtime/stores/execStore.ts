import type { ExecState, StageMaps } from './types';

function emptyStageMaps(): StageMaps {
  return {
    stageStatus: {},
    stageOutputs: {},
    stageConfidence: {},
    stageArtifacts: {},
    beforeQuestionsByStage: {},
    afterQuestionsByStage: {},
    retryDisabledByStage: {},
  };
}

function emptyTimelineFold(): ExecState['timelineFold'] {
  return { segmentExpandedByKey: {} };
}

export const execStore: ExecState = {
  currentRunStageId: null,
  currentPausedStageId: null,
  execOutputPinnedStageId: null,
  currentBeforeQuestionStageId: null,
  dagWaveActiveStageIds: [],
  dagWaveIndex: null,
  llmUsageTotalTokens: 0,
  timelineFold: emptyTimelineFold(),
  stageMaps: emptyStageMaps(),
  engineActivityFeed: [],
  stageExecSemantic: {},
  selfHealActive: false,
  qualityReport: null,
};

/** @deprecated 使用 execStore.stageMaps */
export const stageMaps = execStore.stageMaps;

function clearRecord(rec: Record<string, unknown>): void {
  for (const k of Object.keys(rec)) {
    delete rec[k];
  }
}

export function resetExecStore(): void {
  const maps = execStore.stageMaps;
  clearRecord(maps.stageStatus as Record<string, unknown>);
  clearRecord(maps.stageOutputs as Record<string, unknown>);
  clearRecord(maps.stageConfidence as Record<string, unknown>);
  clearRecord(maps.stageArtifacts as Record<string, unknown>);
  clearRecord(maps.beforeQuestionsByStage as Record<string, unknown>);
  clearRecord(maps.afterQuestionsByStage as Record<string, unknown>);
  clearRecord(maps.retryDisabledByStage as Record<string, unknown>);
  execStore.execOutputPinnedStageId = null;
  execStore.currentRunStageId = null;
  execStore.currentPausedStageId = null;
  execStore.currentBeforeQuestionStageId = null;
  execStore.dagWaveActiveStageIds = [];
  execStore.dagWaveIndex = null;
  execStore.llmUsageTotalTokens = 0;
  execStore.timelineFold = emptyTimelineFold();
  execStore.engineActivityFeed = [];
  execStore.stageExecSemantic = {};
  execStore.selfHealActive = false;
  execStore.qualityReport = null;
}
