import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  disableSyncUiRefreshForTest,
  enableSyncUiRefreshForTest,
  getPendingUiRefreshTargetsForTest,
  resetUiRefreshDepsForTest,
  resetUiRefreshSchedulerForTest,
  scheduleUiRefresh,
  setUiRefreshDepsForTest,
} from '../webview/shared/uiRefreshSchedulerCore';

function noop(): void {}

function mockDeps(overrides: Partial<Parameters<typeof setUiRefreshDepsForTest>[0]> = {}) {
  return {
    syncPauseBarVisibility: () => ({ showPauseBar: false }),
    syncOutputVisibility: noop,
    renderExecTimeline: noop,
    renderExecDagGraph: noop,
    renderPauseBarFromStore: noop,
    renderPauseBar: noop,
    refreshExecOutputPanel: noop,
    selectExecTimelineStage: noop,
    ...overrides,
  };
}

test('scheduleUiRefresh coalesces duplicate targets into one flush', () => {
  enableSyncUiRefreshForTest();
  resetUiRefreshSchedulerForTest();
  resetUiRefreshDepsForTest();
  let timelineCalls = 0;
  setUiRefreshDepsForTest(
    mockDeps({
      renderExecTimeline: () => {
        timelineCalls += 1;
      },
    }),
  );
  scheduleUiRefresh(['timeline', 'timeline', 'timeline']);
  assert.equal(timelineCalls, 1);
  assert.equal(getPendingUiRefreshTargetsForTest().length, 0);
  disableSyncUiRefreshForTest();
});

test('flush order runs visibility before timeline', () => {
  enableSyncUiRefreshForTest();
  resetUiRefreshSchedulerForTest();
  resetUiRefreshDepsForTest();
  const order: string[] = [];
  setUiRefreshDepsForTest(
    mockDeps({
      syncPauseBarVisibility: () => {
        order.push('pauseBarVisibility');
        return { showPauseBar: false };
      },
      syncOutputVisibility: () => order.push('outputVisibility'),
      renderExecTimeline: () => order.push('timeline'),
      renderExecDagGraph: () => order.push('dagGraph'),
      renderPauseBarFromStore: () => order.push('pauseBar'),
      refreshExecOutputPanel: () => order.push('outputPanel'),
    }),
  );
  scheduleUiRefresh(['outputPanel', 'timeline', 'pauseBarVisibility', 'outputVisibility']);
  assert.deepEqual(order, ['pauseBarVisibility', 'outputVisibility', 'timeline', 'outputPanel']);
  disableSyncUiRefreshForTest();
});

test('mergeContext last-write-wins for pauseBar within same rAF frame', () => {
  resetUiRefreshSchedulerForTest();
  resetUiRefreshDepsForTest();
  disableSyncUiRefreshForTest();
  let renderedStageId = '';
  setUiRefreshDepsForTest(
    mockDeps({
      renderPauseBar: (stageId) => {
        renderedStageId = stageId;
      },
    }),
  );
  const g = globalThis as { requestAnimationFrame?: (fn: () => void) => number };
  const origRaf = g.requestAnimationFrame;
  let rafCb: (() => void) | null = null;
  g.requestAnimationFrame = (fn: () => void) => {
    rafCb = fn;
    return 1;
  };
  try {
    scheduleUiRefresh(['pauseBar'], { pauseBar: { stageId: 'stage-a', uiState: { showPauseBar: true } } });
    scheduleUiRefresh(['pauseBar'], { pauseBar: { stageId: 'stage-b', uiState: { showPauseBar: true } } });
    assert.ok(rafCb);
    (rafCb as () => void)();
    assert.equal(renderedStageId, 'stage-b');
  } finally {
    if (origRaf) {
      g.requestAnimationFrame = origRaf;
    } else {
      delete g.requestAnimationFrame;
    }
  }
});
