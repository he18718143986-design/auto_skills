import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import type {
  FileWriteConfig,
  StageRuntime,
  WorkflowInstance,
} from '../WorkflowDefinition';
import {
  findFileWriteSourceRuntime,
  findStageRuntimeByOutputKey,
} from '../non-llm-runners/helpers';

function instanceWith(
  stageIds: string[],
  outputsByIndex: Array<Record<string, unknown>>,
): WorkflowInstance {
  return {
    definition: {
      id: 'wf',
      version: '2.0',
      meta: { title: 't', taskType: 'software', userInput: '', createdAt: '' },
      stages: stageIds.map((id) => ({ id, title: id, tool: 'llm-text' })),
    },
    currentStageIndex: 0,
    status: 'running',
    stageRuntimes: outputsByIndex.map(
      (outputs, i) =>
        ({
          stageId: stageIds[i],
          status: 'completed',
          outputs,
          retryCount: 0,
        }) as unknown as StageRuntime,
    ),
  } as unknown as WorkflowInstance;
}

test('findStageRuntimeByOutputKey returns the first runtime exposing the key', () => {
  const inst = instanceWith(['a', 'b'], [{ x: 1 }, { y: 2 }]);
  assert.equal(findStageRuntimeByOutputKey(inst, 'y')?.stageId, 'b');
  assert.equal(findStageRuntimeByOutputKey(inst, 'missing'), undefined);
});

test('findFileWriteSourceRuntime resolves by explicit sourceStageId', () => {
  const inst = instanceWith(['a', 'b'], [{ x: 1 }, { y: 2 }]);
  const cfg = { sourceStageId: 'b', sourceOutputKey: 'x' } as unknown as FileWriteConfig;
  assert.equal(findFileWriteSourceRuntime(inst, cfg)?.stageId, 'b');
});

test('findFileWriteSourceRuntime returns undefined for an unknown sourceStageId', () => {
  const inst = instanceWith(['a'], [{ x: 1 }]);
  const cfg = { sourceStageId: 'nope', sourceOutputKey: 'x' } as unknown as FileWriteConfig;
  assert.equal(findFileWriteSourceRuntime(inst, cfg), undefined);
});

test('findFileWriteSourceRuntime falls back to output-key lookup when no sourceStageId', () => {
  const inst = instanceWith(['a', 'b'], [{ x: 1 }, { y: 2 }]);
  const cfg = { sourceOutputKey: 'x' } as unknown as FileWriteConfig;
  assert.equal(findFileWriteSourceRuntime(inst, cfg)?.stageId, 'a');
});
