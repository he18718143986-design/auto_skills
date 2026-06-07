import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Stage, WorkflowDefinition, WorkflowInstance } from '../WorkflowDefinition';
import type { ExecuteNextStageLoopParams } from '../WorkflowExecutorTypes';
import { buildStageStepContext } from '../stage-runners/StageStepContext';
import { runStagePrelude } from '../stage-runners/StagePrelude';
import { evaluateSkipCondition } from '../WorkflowSkipCondition';

function meta(taskType: string, extra?: { taskWorkspacePath?: string }) {
  return {
    title: 't',
    taskType,
    userInput: 'input',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  };
}

function minimalInstance(stage: Stage): WorkflowInstance {
  const wf: WorkflowDefinition = {
    id: 'wf-1',
    version: '2.0',
    meta: meta('software'),
    stages: [stage],
  };
  return {
    definition: wf,
    stageRuntimes: [{ stageId: stage.id, status: 'pending', outputs: {}, retryCount: 0 }],
    status: 'running',
    currentStageIndex: 0,
  };
}

function minimalParams(instance: WorkflowInstance): ExecuteNextStageLoopParams {
  const posted: unknown[] = [];
  return {
    instance,
    panel: {},
    currentInstanceKey: 'key-1',
    setCurrentInstanceKey: () => {},
    evaluateSkipCondition,
    postMessage: (_p, msg) => {
      posted.push(msg);
    },
    scheduleSave: () => {},
    debugLog: () => {},
    primaryOutputKey: (s) => s.outputs[0]?.key ?? 'out',
    ensureTaskDir: () => '/tmp/task',
    resolveInput: async () => '',
    executeLlmText: async () => '',
    applyPatchInstructions: async () => {},
    resolveTaskFilePath: () => '/tmp/f',
    resolveOutputPath: () => '/tmp/out',
    runCodeRunner: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    isCancellationError: () => false,
  };
}

test('runStagePrelude skips stage when skipIf matches', async () => {
  const stage: Stage = {
    id: 'stage_a',
    title: 'A',
    tool: 'llm-text',
    toolConfig: { type: 'llm-text', systemPrompt: 'x'.repeat(40) },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'out', format: 'markdown' }],
    pauseAfter: false,
    skipIf: { type: 'exitCodeZero', stageId: 'stage_a', outputKey: '_exitCode' },
  };
  const instance = minimalInstance(stage);
  instance.stageRuntimes[0]!.outputs._exitCode = 0;
  const params = minimalParams(instance);
  const ctx = buildStageStepContext(params, 0);
  const outcome = await runStagePrelude(ctx);
  assert.equal(outcome, 'continue');
  assert.equal(instance.stageRuntimes[0]!.status, 'skipped');
});

test('runStagePrelude fails decision stage with non-llm-text tool', async () => {
  const stage: Stage = {
    id: 'stage_decide',
    title: 'D',
    tool: 'file-read',
    toolConfig: { type: 'file-read', filePath: 'a.txt' },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'out', format: 'markdown' }],
    pauseAfter: true,
    isDecisionStage: true,
  };
  const instance = minimalInstance(stage);
  const params = minimalParams(instance);
  const ctx = buildStageStepContext(params, 0);
  const outcome = await runStagePrelude(ctx);
  assert.equal(outcome, 'failed');
  assert.equal(instance.status, 'failed');
});
