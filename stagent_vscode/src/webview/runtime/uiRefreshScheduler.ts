import type { PauseBarUiState } from './pause-bar/PauseBarShell';
import { execStore } from './stores';
import { isDecisionStage } from './shell';
import {
  bindUiRefreshDeps,
  scheduleUiRefresh,
  type UiRefreshContext,
  type UiRefreshDeps,
  type UiRefreshTarget,
} from '../shared/uiRefreshSchedulerCore';

export type { UiRefreshContext, UiRefreshTarget } from '../shared/uiRefreshSchedulerCore';
export {
  enableSyncUiRefreshForTest,
  disableSyncUiRefreshForTest,
  flushUiRefreshForTest,
  getPendingUiRefreshTargetsForTest,
  resetUiRefreshDepsForTest,
  resetUiRefreshSchedulerForTest,
  setUiRefreshDepsForTest,
} from '../shared/uiRefreshSchedulerCore';

const maps = execStore.stageMaps;

function buildDefaultDeps(): UiRefreshDeps {
  const { renderExecCockpit } = require('./view-exec-cockpit') as typeof import('./view-exec-cockpit');
  const { renderQualityReport } = require('./view-quality-report') as typeof import('./view-quality-report');
  const { renderExecTimeline, selectExecTimelineStage } =
    require('./view-exec-stage-list') as typeof import('./view-exec-stage-list');
  const { renderExecDagGraph } = require('./view-exec-dag-graph') as typeof import('./view-exec-dag-graph');
  const { syncOutputVisibility, syncPauseBarVisibility, refreshExecOutputPanel } =
    require('./view-exec-output-panel') as typeof import('./view-exec-output-panel');
  const { getQuestionAfter, renderAfterQuestionsCard } =
    require('./view-exec-decision-form') as typeof import('./view-exec-decision-form');
  const { renderPauseBar } = require('./pause-bar/index') as typeof import('./pause-bar/index');

  function renderPauseBarFromStore(): void {
    const uiState = syncPauseBarVisibility() as PauseBarUiState & { showPauseBar?: boolean };
    if (!uiState.showPauseBar || !execStore.currentPausedStageId) {
      return;
    }
    const sid = execStore.currentPausedStageId;
    if (isDecisionStage(sid)) {
      renderPauseBar(sid, uiState);
      return;
    }
    const buffered = maps.afterQuestionsByStage[sid];
    const qa = buffered && buffered.length > 0 ? buffered : getQuestionAfter(sid);
    if (qa.length > 0) {
      renderAfterQuestionsCard(sid, qa);
    } else {
      renderPauseBar(sid, uiState);
    }
  }

  return {
    syncPauseBarVisibility,
    syncOutputVisibility,
    renderExecTimeline,
    renderExecDagGraph,
    renderPauseBarFromStore,
    renderPauseBar,
    refreshExecOutputPanel,
    selectExecTimelineStage,
    renderExecCockpit,
    renderQualityReport,
  };
}

let defaultDeps: UiRefreshDeps | null = null;

function ensureDefaultDepsBound(): void {
  if (!defaultDeps) {
    defaultDeps = buildDefaultDeps();
  }
  bindUiRefreshDeps(defaultDeps);
}

export function scheduleUiRefreshBound(targets: UiRefreshTarget[], context?: UiRefreshContext): void {
  ensureDefaultDepsBound();
  scheduleUiRefresh(targets, context);
}

export { scheduleUiRefreshBound as scheduleUiRefresh };
