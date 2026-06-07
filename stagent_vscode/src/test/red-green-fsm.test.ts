import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planImplRedConfirm,
  planImplRedFsm,
  applyRedGreenFsmResult,
  evaluateImplRedConfirmResult,
} from '../RedGreenFsm';
import type { StageRuntime, WorkflowDefinition } from '../WorkflowDefinition';

const wf: WorkflowDefinition = {
  id: 'w',
  version: '2.0',
  meta: { title: 't', taskType: 'software', userInput: 'u', createdAt: '2020-01-01T00:00:00Z' },
  stages: [
    {
      id: 'stage_test_run_auth',
      title: 'test',
      tool: 'code-runner',
      toolConfig: { type: 'code-runner', command: 'npm test', captureOutput: true },
      input: { sources: [], mergeStrategy: 'concat' },
      outputs: [],
      pauseAfter: false,
    },
    {
      id: 'stage_impl_auth',
      title: 'impl',
      tool: 'llm-text',
      toolConfig: { type: 'llm-text', systemPrompt: 'impl' },
      input: { sources: [], mergeStrategy: 'concat' },
      outputs: [{ key: 'out', format: 'text' }],
      pauseAfter: false,
    },
  ],
};

test('planImplRedConfirm runs in warn mode', () => {
  const impl = wf.stages[1];
  const plan = planImplRedConfirm(impl, wf, 'warn');
  assert.equal(plan.phase, 'run-paired-test');
  assert.equal(plan.pairedStage?.id, 'stage_test_run_auth');
});

test('planImplRedConfirm skips when off', () => {
  const plan = planImplRedConfirm(wf.stages[1], wf, 'off');
  assert.equal(plan.phase, 'skip');
});

test('evaluateImplRedConfirmResult GREEN warns in warn mode', () => {
  const ev = evaluateImplRedConfirmResult({ mode: 'warn', exitCode: 0, threw: false });
  assert.equal(ev.outcome, 'warn');
});

test('evaluateImplRedConfirmResult GREEN blocks in hard mode', () => {
  const ev = evaluateImplRedConfirmResult({ mode: 'hard', exitCode: 0, threw: false });
  assert.equal(ev.outcome, 'block');
});

test('evaluateImplRedConfirmResult RED passes', () => {
  const ev = evaluateImplRedConfirmResult({ mode: 'hard', exitCode: 1, threw: false });
  assert.equal(ev.outcome, 'pass');
});

test('planImplRedFsm skips when slice already red-confirmed', () => {
  const impl = wf.stages[1];
  const runtime: StageRuntime = {
    stageId: impl.id,
    status: 'pending',
    outputs: {},
    retryCount: 0,
    redGreenSlice: { semantic: 'auth', phase: 'red-confirmed' },
  };
  const plan = planImplRedFsm(impl, wf, 'hard', runtime);
  assert.equal(plan.skipRunAlreadyConfirmed, true);
});

test('planImplRedFsm re-runs RED on retry with comment', () => {
  const impl = wf.stages[1];
  const runtime: StageRuntime = {
    stageId: impl.id,
    status: 'pending',
    outputs: {},
    retryCount: 1,
    retryComment: 'fix test',
    redGreenSlice: { semantic: 'auth', phase: 'red-confirmed' },
  };
  const plan = planImplRedFsm(impl, wf, 'hard', runtime);
  assert.equal(plan.phase, 'run-paired-test');
  assert.equal(plan.skipRunAlreadyConfirmed, undefined);
});

test('applyRedGreenFsmResult sets red-confirmed on pass', () => {
  const runtime: StageRuntime = { stageId: 'stage_impl_auth', status: 'pending', outputs: {}, retryCount: 0 };
  applyRedGreenFsmResult(runtime, 'stage_impl_auth', { outcome: 'pass', reason: 'RED' });
  assert.deepEqual(runtime.redGreenSlice, { semantic: 'auth', phase: 'red-confirmed' });
});
