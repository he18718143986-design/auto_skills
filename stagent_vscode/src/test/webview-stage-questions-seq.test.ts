import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  applyStageStatusSnapshot,
  getLastAppliedBackendSeq,
  patchStageStatus,
  resetStageStatusSeqState,
} from '../webview/runtime/stageStatusStore';
import {
  getRecordedStageQuestionsSeq,
  recordStageQuestionsSeq,
  resetStageQuestionsSeqState,
  shouldApplyStageQuestions,
} from '../webview/runtime/stageQuestionsSeqGate';
import { execStore, resetExecStore } from '../webview/runtime/stores';

test('stageQuestions: allows payload before status without bumping global seq', () => {
  resetExecStore();
  resetStageStatusSeqState();
  patchStageStatus('stage_q', 'running', 5);

  assert.equal(shouldApplyStageQuestions('stage_q', 'after', 8, getLastAppliedBackendSeq()), true);
  recordStageQuestionsSeq('stage_q', 'after', 8);
  execStore.stageMaps.afterQuestionsByStage.stage_q = [{ id: 'q1', text: 'why?' }];

  const status = patchStageStatus('stage_q', 'paused', 9);
  assert.equal(status.applied, true);
  assert.equal(getLastAppliedBackendSeq(), 9);
  assert.deepEqual(execStore.stageMaps.afterQuestionsByStage.stage_q, [{ id: 'q1', text: 'why?' }]);
});

test('stageQuestions: rejects global stale replay after instanceResumed snapshot', () => {
  resetExecStore();
  resetStageStatusSeqState();
  applyStageStatusSnapshot({ stage_q: 'paused' }, 100);

  assert.equal(shouldApplyStageQuestions('stage_q', 'after', 50, getLastAppliedBackendSeq()), false);
});

test('stageQuestions: rejects duplicate per-stage seq without blocking newer status', () => {
  resetExecStore();
  resetStageStatusSeqState();

  assert.equal(shouldApplyStageQuestions('stage_q', 'after', 11, getLastAppliedBackendSeq()), true);
  recordStageQuestionsSeq('stage_q', 'after', 11);
  assert.equal(shouldApplyStageQuestions('stage_q', 'after', 11, getLastAppliedBackendSeq()), false);

  const status = patchStageStatus('stage_q', 'paused', 12);
  assert.equal(status.applied, true);
});

test('stageQuestionsBefore: same gate semantics for before-questions path', () => {
  resetExecStore();
  resetStageStatusSeqState();
  patchStageStatus('stage_b', 'running', 3);

  assert.equal(shouldApplyStageQuestions('stage_b', 'before', 6, getLastAppliedBackendSeq()), true);
  recordStageQuestionsSeq('stage_b', 'before', 6);
  assert.equal(getRecordedStageQuestionsSeq('stage_b', 'before'), 6);

  assert.equal(shouldApplyStageQuestions('stage_b', 'before', 6, getLastAppliedBackendSeq()), false);
  assert.equal(patchStageStatus('stage_b', 'waiting-questions', 7).applied, true);
});

test('resetStageStatusSeqState clears per-stage questions seq', () => {
  resetStageQuestionsSeqState();
  recordStageQuestionsSeq('stage_x', 'after', 4);
  recordStageQuestionsSeq('stage_x', 'before', 5);
  resetStageStatusSeqState();
  assert.equal(getRecordedStageQuestionsSeq('stage_x', 'after'), undefined);
  assert.equal(getRecordedStageQuestionsSeq('stage_x', 'before'), undefined);
});
