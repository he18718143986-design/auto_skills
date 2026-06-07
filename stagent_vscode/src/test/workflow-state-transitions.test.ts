import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import type { Stage, StageRuntime, WorkflowDefinition, WorkflowInstance } from '../WorkflowDefinition';
import {
  applyQuestionBeforeAnswers,
  applyRetryBase,
  applyRetryForDecisionCurrent,
  applyRetryForNonDecision,
  collectDecisionRetryResets,
  collectNonDecisionRetryResets,
  guardedStageTransition,
  markApproved,
  markDecisionApproved,
} from '../WorkflowStateTransitions';

function makeStage(partial: Partial<Stage> & Pick<Stage, 'id' | 'title'>): Stage {
  const { id, title, ...rest } = partial;
  return {
    id,
    title,
    tool: 'llm-text',
    toolConfig: { type: 'llm-text', systemPrompt: 'x' },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'out', format: 'text' }],
    pauseAfter: false,
    ...rest,
  };
}

test('markApproved sets done/completedAt', () => {
  const rt: StageRuntime = { stageId: 's1', status: 'paused', outputs: {}, retryCount: 0 };
  markApproved(rt, '2026-05-08T00:00:00.000Z');
  assert.equal(rt.status, 'done');
  assert.equal(rt.completedAt, '2026-05-08T00:00:00.000Z');
});

test('applyRetryBase clears lastError but keeps lastFailureSnapshot', () => {
  const rt: StageRuntime = {
    stageId: 'stage_impl',
    status: 'error',
    outputs: {},
    retryCount: 0,
    lastError: { error: 'fail', errorType: 'tool-execution-failed' },
    lastFailureSnapshot: {
      capturedAt: '2026-01-01T00:00:00.000Z',
      stderr: 'keep-me',
      outputs: {},
    },
  };
  applyRetryBase(rt, 'retry hint');
  assert.equal(rt.lastError, undefined);
  assert.equal(rt.lastFailureSnapshot?.stderr, 'keep-me');
  assert.equal(rt.retryComment, 'retry hint');
});

test('markApproved clears lastFailureSnapshot', () => {
  const rt: StageRuntime = {
    stageId: 's1',
    status: 'paused',
    outputs: {},
    retryCount: 0,
    lastFailureSnapshot: { capturedAt: 'x', outputs: {} },
  };
  markApproved(rt, '2026-05-08T00:00:00.000Z');
  assert.equal(rt.lastFailureSnapshot, undefined);
});

test('guardedStageTransition to done clears lastFailureSnapshot', () => {
  const rt: StageRuntime = {
    stageId: 's1',
    status: 'running',
    outputs: {},
    retryCount: 0,
    lastFailureSnapshot: { capturedAt: 'x', outputs: {} },
  };
  guardedStageTransition(rt, 'done', 'test');
  assert.equal(rt.lastFailureSnapshot, undefined);
});

test('markDecisionApproved writes decision record', () => {
  const stage = makeStage({ id: 'stage_decide_x', title: 'x' });
  const rt: StageRuntime = { stageId: stage.id, status: 'paused', outputs: {}, retryCount: 0 };
  const record = markDecisionApproved(stage, rt, '', 'fallback', '2026-05-08T00:00:00.000Z');
  assert.equal(record, 'fallback');
  assert.equal(rt.outputs.decisionRecord, 'fallback');
  assert.equal(rt.approvedDecisionRecord, 'fallback');
});

test('retry helpers keep current semantics', () => {
  const rt: StageRuntime = {
    stageId: 'stage_impl_x',
    status: 'done',
    outputs: { text: 'x', _exitCode: 1 },
    retryCount: 0,
  };
  applyRetryBase(rt, 'retry');
  applyRetryForNonDecision(rt);
  assert.equal(rt.retryCount, 1);
  assert.equal(rt.status, 'pending');
  assert.deepEqual(rt.outputs, {});
});

test('collectDecisionRetryResets resets dependent downstream stages', () => {
  const definition: WorkflowDefinition = {
    id: 'wf',
    version: '2.0',
    meta: { title: 't', taskType: 'software', userInput: 'u', createdAt: new Date().toISOString() },
    stages: [
      makeStage({ id: 'stage_decide_a', title: 'd', input: { sources: [], mergeStrategy: 'concat' } }),
      makeStage({
        id: 'stage_impl_a',
        title: 'i',
        input: { sources: [{ type: 'stage-output', stageId: 'stage_decide_a', outputKey: 'decisionRecord' }], mergeStrategy: 'concat' },
      }),
    ],
  };
  const instance: WorkflowInstance = {
    definition,
    currentStageIndex: 0,
    status: 'running',
    stageRuntimes: [
      { stageId: 'stage_decide_a', status: 'done', outputs: {}, retryCount: 0 },
      { stageId: 'stage_impl_a', status: 'done', outputs: { code: 'x' }, retryCount: 0, startedAt: 'x', completedAt: 'y' },
    ],
  };
  const out = collectDecisionRetryResets(definition, instance, 'stage_decide_a', 0);
  assert.deepEqual(out.resetStageIds, ['stage_impl_a']);
  assert.equal(instance.stageRuntimes[1].status, 'pending');
  assert.deepEqual(instance.stageRuntimes[1].outputs, {});
});

test('collectNonDecisionRetryResets resets transitive downstream consumers', () => {
  const definition: WorkflowDefinition = {
    id: 'wf',
    version: '2.0',
    meta: { title: 't', taskType: 'software', userInput: 'u', createdAt: new Date().toISOString() },
    stages: [
      makeStage({ id: 'stage_impl', title: 'impl' }),
      makeStage({
        id: 'stage_test_write',
        title: 'write',
        input: {
          sources: [{ type: 'stage-output', stageId: 'stage_impl', outputKey: 'out' }],
          mergeStrategy: 'concat',
        },
      }),
      makeStage({
        id: 'stage_test_run',
        title: 'run',
        input: {
          sources: [{ type: 'stage-output', stageId: 'stage_test_write', outputKey: 'out' }],
          mergeStrategy: 'concat',
        },
      }),
    ],
  };
  const instance: WorkflowInstance = {
    definition,
    currentStageIndex: 0,
    status: 'failed',
    stageRuntimes: [
      { stageId: 'stage_impl', status: 'done', outputs: { out: 'x' }, retryCount: 0 },
      { stageId: 'stage_test_write', status: 'done', outputs: { out: 't' }, retryCount: 0 },
      { stageId: 'stage_test_run', status: 'error', outputs: {}, retryCount: 0, lastError: { errorType: 'tool-execution-failed', error: 'fail' } },
    ],
  };
  const out = collectNonDecisionRetryResets(definition, instance, 'stage_impl');
  assert.deepEqual(out.resetStageIds, ['stage_test_write', 'stage_test_run']);
  assert.equal(instance.stageRuntimes[1].status, 'pending');
  assert.equal(instance.stageRuntimes[2].status, 'pending');
  assert.equal(instance.stageRuntimes[2].lastError, undefined);
  assert.equal(instance.stageRuntimes[2].lastFailureSnapshot, undefined);
});

test('collectNonDecisionRetryResets uses TDD slice when DAG has no consumer edges', () => {
  const definition: WorkflowDefinition = {
    id: 'wf',
    version: '2.0',
    meta: { title: 't', taskType: 'software', userInput: 'u', createdAt: new Date().toISOString() },
    stages: [
      makeStage({ id: 'stage_decide_chat_core', title: 'd', isDecisionStage: true, pauseAfter: true }),
      makeStage({
        id: 'stage_test_write_chat_integration',
        title: 'write',
        input: { sources: [{ type: 'user-input' }], mergeStrategy: 'concat' },
      }),
      makeStage({
        id: 'stage_impl_chat_websocket_server',
        title: 'impl',
        input: { sources: [{ type: 'user-input' }], mergeStrategy: 'concat' },
      }),
      makeStage({
        id: 'stage_test_run_chat_integration',
        title: 'run',
        tool: 'code-runner',
        toolConfig: { type: 'code-runner', command: 'npm test', captureOutput: true },
        input: { sources: [{ type: 'user-input' }], mergeStrategy: 'concat' },
      }),
    ],
  };
  const instance: WorkflowInstance = {
    definition,
    currentStageIndex: 3,
    status: 'failed',
    stageRuntimes: [
      { stageId: 'stage_decide_chat_core', status: 'done', outputs: {}, retryCount: 0 },
      { stageId: 'stage_test_write_chat_integration', status: 'done', outputs: {}, retryCount: 0 },
      { stageId: 'stage_impl_chat_websocket_server', status: 'done', outputs: {}, retryCount: 0 },
      { stageId: 'stage_test_run_chat_integration', status: 'error', outputs: {}, retryCount: 0 },
    ],
  };
  const out = collectNonDecisionRetryResets(
    definition,
    instance,
    'stage_impl_chat_websocket_server',
  );
  assert.deepEqual(out.resetStageIds, [
    'stage_test_write_chat_integration',
    'stage_test_run_chat_integration',
  ]);
});

test('collectDecisionRetryResets (DAG) resets transitive consumers via dependsOn', () => {
  const definition: WorkflowDefinition = {
    id: 'wf',
    version: '2.0',
    meta: { title: 't', taskType: 'software', userInput: 'u', createdAt: new Date().toISOString() },
    globalConfig: { enableDagScheduler: true },
    stages: [
      makeStage({ id: 'stage_decide_a', title: 'd', input: { sources: [], mergeStrategy: 'concat' } }),
      makeStage({
        id: 'stage_impl_a',
        title: 'i',
        dependsOn: ['stage_decide_a'],
        input: { sources: [{ type: 'user-input', label: 'u' }], mergeStrategy: 'concat' },
      }),
    ],
  };
  const instance: WorkflowInstance = {
    definition,
    currentStageIndex: 0,
    status: 'running',
    stageRuntimes: [
      { stageId: 'stage_decide_a', status: 'done', outputs: {}, retryCount: 0 },
      { stageId: 'stage_impl_a', status: 'done', outputs: { out: 'x' }, retryCount: 0 },
    ],
  };
  const out = collectDecisionRetryResets(definition, instance, 'stage_decide_a', 0);
  assert.deepEqual(out.resetStageIds, ['stage_impl_a']);
  assert.equal(instance.stageRuntimes[1].status, 'pending');
});

test('applyQuestionBeforeAnswers and decision retry current', () => {
  const rt: StageRuntime = {
    stageId: 'stage_decide_a',
    status: 'waiting-questions',
    outputs: { decisionRecord: 'x' },
    retryCount: 0,
    approvedDecisionRecord: 'x',
  };
  applyQuestionBeforeAnswers(rt, { q1: 'a' });
  assert.equal(rt.status, 'pending');
  assert.equal(rt.questionBeforeAnswers?.q1, 'a');

  applyRetryForDecisionCurrent(rt);
  assert.equal(rt.status, 'retrying');
  assert.equal(rt.approvedDecisionRecord, undefined);
  assert.equal(rt.outputs.decisionRecord, undefined);
});
