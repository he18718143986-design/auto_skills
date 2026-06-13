import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { detectCrossSliceBleeding } from '../RedGreenCrossSlice';
import type { Stage, StageRuntime, WorkflowDefinition } from '../WorkflowDefinition';

function impl(id: string, file: string): Stage {
  return {
    id,
    title: id,
    tool: 'llm-text',
    toolConfig: { type: 'llm-text', systemPrompt: 'x', writeOutputToFile: file },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'out', format: 'text' }],
    pauseAfter: false,
  };
}

function testWrite(id: string): Stage {
  return {
    id,
    title: id,
    tool: 'llm-text',
    toolConfig: { type: 'llm-text', systemPrompt: 'x', writeOutputToFile: 'test_calculator.py' },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'testFile', format: 'text' }],
    pauseAfter: false,
  };
}

function testRun(id: string): Stage {
  return {
    id,
    title: id,
    tool: 'code-runner',
    toolConfig: { type: 'code-runner', command: 'python3 test_calculator.py', captureOutput: true },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'testReport', format: 'text' }],
    pauseAfter: false,
  };
}

function rt(status: StageRuntime['status']): StageRuntime {
  return { stageId: 'x', status, outputs: {}, retryCount: 0 };
}

test('detectCrossSliceBleeding: calculator core→priority on shared calculator.py', () => {
  const stages = [
    testWrite('stage_test_write_core'),
    impl('stage_impl_core', 'calculator.py'),
    testRun('stage_test_run_core'),
    testWrite('stage_test_write_priority'),
    impl('stage_impl_priority', 'calculator.py'),
    testRun('stage_test_run_priority'),
  ];
  const workflow: WorkflowDefinition = {
    id: 'wf',
    version: '2.0',
    meta: { title: 't', taskType: 'prototype', userInput: 'u', createdAt: '' },
    stages,
  };
  const runtimes = stages.map((s, i) => {
    if (i <= 3) {
      return rt('done');
    }
    return rt('pending');
  });
  const info = detectCrossSliceBleeding({
    workflow,
    stageRuntimes: runtimes,
    implStage: stages[4],
  });
  assert.equal(info.bleeding, true);
  assert.equal(info.priorImplStageId, 'stage_impl_core');
  assert.equal(info.testWriteStageId, 'stage_test_write_priority');
});

test('detectCrossSliceBleeding: first slice impl has no prior overlap', () => {
  const stages = [
    testWrite('stage_test_write_core'),
    impl('stage_impl_core', 'calculator.py'),
    testRun('stage_test_run_core'),
  ];
  const workflow: WorkflowDefinition = {
    id: 'wf',
    version: '2.0',
    meta: { title: 't', taskType: 'prototype', userInput: 'u', createdAt: '' },
    stages,
  };
  const runtimes = stages.map(() => rt('done'));
  const info = detectCrossSliceBleeding({
    workflow,
    stageRuntimes: runtimes,
    implStage: stages[1],
  });
  assert.equal(info.bleeding, false);
});
