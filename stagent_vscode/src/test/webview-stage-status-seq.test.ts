import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  applyStageStatusSnapshot,
  getStageStatus,
  patchStageStatus,
  resetStageStatusSeqState,
  resetStagesToPending,
  tryAdvanceBackendSeq,
} from '../webview/runtime/stageStatusStore';
import { execStore, resetExecStore } from '../webview/runtime/stores';

test('patchStageStatus: rejects stale seq and keeps status unchanged', () => {
  resetExecStore();
  resetStageStatusSeqState();
  patchStageStatus('stage_a', 'running', 10);
  patchStageStatus('stage_a', 'done', 11);
  const stale = patchStageStatus('stage_a', 'error', 9);
  assert.equal(stale.applied, false);
  assert.equal(stale.status, 'done');
});

test('patchStageStatus: applies newer seq after terminal success policy', () => {
  resetExecStore();
  resetStageStatusSeqState();
  patchStageStatus('stage_b', 'done', 5);
  const lateError = patchStageStatus('stage_b', 'error', 6);
  assert.equal(lateError.applied, false);
  assert.equal(lateError.status, 'done');
});

test('patchStageStatus: stale stageError seq does not override newer done', () => {
  resetExecStore();
  resetStageStatusSeqState();
  patchStageStatus('stage_err', 'done', 20);
  const staleError = patchStageStatus('stage_err', 'error', 19);
  assert.equal(staleError.applied, false);
  assert.equal(staleError.status, 'done');
});

test('patchStageStatus: without seq still applies policy', () => {
  resetExecStore();
  resetStageStatusSeqState();
  patchStageStatus('stage_c', 'done');
  const r = patchStageStatus('stage_c', 'error');
  assert.equal(r.applied, false);
  assert.equal(r.status, 'done');
});

test('applyStageStatusSnapshot: same snapshotSeq writes all stages', () => {
  resetExecStore();
  resetStageStatusSeqState();
  applyStageStatusSnapshot(
    { stage_a: 'done', stage_b: 'running', stage_c: 'error' },
    5,
  );
  assert.equal(getStageStatus('stage_a'), 'done');
  assert.equal(getStageStatus('stage_b'), 'running');
  assert.equal(getStageStatus('stage_c'), 'error');
});

test('applyStageStatusSnapshot: after snapshotSeq rejects older patch', () => {
  resetExecStore();
  resetStageStatusSeqState();
  applyStageStatusSnapshot({ stage_a: 'done', stage_b: 'running' }, 10);
  const stale = patchStageStatus('stage_b', 'error', 9);
  assert.equal(stale.applied, false);
  assert.equal(getStageStatus('stage_b'), 'running');
});

test('resetStagesToPending: same batchSeq resets all stages to pending', () => {
  resetExecStore();
  resetStageStatusSeqState();
  patchStageStatus('stage_x', 'done', 1);
  patchStageStatus('stage_y', 'running', 2);
  execStore.stageMaps.stageOutputs.stage_x = 'out';
  execStore.stageMaps.stageConfidence.stage_y = { score: 1, level: 'high', reasons: [] };

  assert.equal(resetStagesToPending(['stage_x', 'stage_y'], 3), true);
  assert.equal(getStageStatus('stage_x'), 'pending');
  assert.equal(getStageStatus('stage_y'), 'pending');
  assert.equal(execStore.stageMaps.stageOutputs.stage_x, undefined);
  assert.equal(execStore.stageMaps.stageConfidence.stage_y, undefined);
});

test('resetStagesToPending: stale batchSeq leaves statuses unchanged', () => {
  resetExecStore();
  resetStageStatusSeqState();
  patchStageStatus('stage_x', 'done', 10);
  assert.equal(resetStagesToPending(['stage_x'], 9), false);
  assert.equal(getStageStatus('stage_x'), 'done');
});

test('tryAdvanceBackendSeq: shared counter rejects stale status after output bump', () => {
  resetExecStore();
  resetStageStatusSeqState();
  assert.equal(tryAdvanceBackendSeq(5), true);
  execStore.stageMaps.stageOutputs.stage_a = 'chunk';
  const staleStatus = patchStageStatus('stage_a', 'running', 4);
  assert.equal(staleStatus.applied, false);
});
