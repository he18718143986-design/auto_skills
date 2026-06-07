import test from 'node:test';
import assert from 'node:assert/strict';
import type { Stage, StageRuntime, WorkflowInstance } from '../WorkflowDefinition';
import {
  deriveActiveStageIds,
  deriveCompletedStageIds,
  deriveReadyStageIds,
  describeWorkflowStagePosition,
  syncInstanceStagePosition,
} from '../WorkflowStagePosition';

function st(partial: Partial<Stage> & Pick<Stage, 'id' | 'title'>): Stage {
  const { id, title, ...rest } = partial;
  return {
    id,
    title,
    tool: 'llm-text',
    toolConfig: { type: 'llm-text', systemPrompt: 'x' },
    input: partial.input ?? { sources: [{ type: 'user-input', label: 'u' }], mergeStrategy: 'concat' },
    outputs: [{ key: 'out', format: 'text' }],
    pauseAfter: false,
    ...rest,
  };
}

function makeInst(stages: Stage[], runtimes: StageRuntime[], idx: number, dag: boolean): WorkflowInstance {
  return {
    definition: {
      id: 'wf',
      version: '2.0',
      meta: { title: 't', taskType: 'software', userInput: 'u', createdAt: new Date().toISOString() },
      stages,
      globalConfig: dag ? { enableDagScheduler: true } : {},
    },
    currentStageIndex: idx,
    stageRuntimes: runtimes,
    status: 'running',
  };
}

test('deriveActiveStageIds includes running and paused', () => {
  const stages = [st({ id: 'a', title: 'a' }), st({ id: 'b', title: 'b' })];
  const inst = makeInst(
    stages,
    [
      { stageId: 'a', status: 'running', outputs: {}, retryCount: 0 },
      { stageId: 'b', status: 'paused', outputs: {}, retryCount: 0 },
    ],
    0,
    true,
  );
  assert.deepEqual(deriveActiveStageIds(inst).sort(), ['a', 'b']);
});

test('deriveCompletedStageIds includes done and skipped', () => {
  const stages = [st({ id: 'a', title: 'a' }), st({ id: 'b', title: 'b' })];
  const inst = makeInst(
    stages,
    [
      { stageId: 'a', status: 'done', outputs: {}, retryCount: 0 },
      { stageId: 'b', status: 'skipped', outputs: {}, retryCount: 0 },
    ],
    1,
    false,
  );
  assert.deepEqual(deriveCompletedStageIds(inst).sort(), ['a', 'b']);
});

test('describeWorkflowStagePosition: linear mode uses currentStageIndex as focus', () => {
  const stages = [st({ id: 'a', title: 'a' }), st({ id: 'b', title: 'b' })];
  const inst = makeInst(
    stages,
    [
      { stageId: 'a', status: 'done', outputs: {}, retryCount: 0 },
      { stageId: 'b', status: 'running', outputs: {}, retryCount: 0 },
    ],
    1,
    false,
  );
  const pos = describeWorkflowStagePosition(inst);
  assert.equal(pos.schedulingMode, 'linear');
  assert.equal(pos.focusStageIndex, 1);
  assert.equal(pos.focusStageId, 'b');
  assert.deepEqual(pos.activeStageIds, ['b']);
  assert.deepEqual(pos.completedStageIds, ['a']);
  assert.deepEqual(pos.readyStageIds, []);
});

test('describeWorkflowStagePosition: dag mode derives ready fork after first done', () => {
  const stages = [
    st({ id: 'a', title: 'a' }),
    st({ id: 'b', title: 'b', dependsOn: ['a'] }),
    st({ id: 'c', title: 'c', dependsOn: ['a'] }),
  ];
  const inst = makeInst(
    stages,
    [
      { stageId: 'a', status: 'done', outputs: {}, retryCount: 0 },
      { stageId: 'b', status: 'pending', outputs: {}, retryCount: 0 },
      { stageId: 'c', status: 'pending', outputs: {}, retryCount: 0 },
    ],
    2,
    true,
  );
  const pos = describeWorkflowStagePosition(inst);
  assert.equal(pos.schedulingMode, 'dag');
  assert.equal(pos.focusStageIndex, 1);
  assert.deepEqual(pos.readyStageIds.sort(), ['b', 'c']);
});

test('syncInstanceStagePosition aligns dag focus after stale index', () => {
  const stages = [st({ id: 'a', title: 'a' }), st({ id: 'b', title: 'b', pauseAfter: true })];
  const inst = makeInst(
    stages,
    [
      { stageId: 'a', status: 'done', outputs: {}, retryCount: 0 },
      { stageId: 'b', status: 'paused', outputs: {}, retryCount: 0 },
    ],
    0,
    true,
  );
  syncInstanceStagePosition(inst);
  assert.equal(inst.currentStageIndex, 1);
});
