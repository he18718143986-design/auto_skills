import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Stage, WorkflowDefinition, WorkflowInstance } from '../WorkflowDefinition';
import type { ExecuteNextStageLoopParams } from '../WorkflowExecutorTypes';
import { buildStageStepContext } from '../stage-runners/StageStepContext';
import { implHollowOutput } from '../ErrorTypeUtils';
import { handleStageExecutionError } from '../stage-runners/StageErrorHandler';

function meta(taskType: string) {
  return {
    title: 't',
    taskType,
    userInput: 'in',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function ctxForStage(stage: Stage): { ctx: ReturnType<typeof buildStageStepContext>; instance: WorkflowInstance } {
  const wf: WorkflowDefinition = {
    id: 'wf-1',
    version: '2.0',
    meta: meta('software'),
    stages: [stage],
  };
  const instance: WorkflowInstance = {
    definition: wf,
    stageRuntimes: [{ stageId: stage.id, status: 'running', outputs: {}, retryCount: 0 }],
    status: 'running',
    currentStageIndex: 0,
  };
  const params: ExecuteNextStageLoopParams = {
    instance,
    panel: {},
    currentInstanceKey: 'k',
    setCurrentInstanceKey: () => {},
    evaluateSkipCondition: () => false,
    postMessage: () => {},
    scheduleSave: () => {},
    debugLog: () => {},
    primaryOutputKey: (s) => s.outputs[0]?.key ?? 'out',
    ensureTaskDir: () => '/tmp',
    resolveInput: async () => '',
    executeLlmText: async () => '',
    applyPatchInstructions: async () => {},
    resolveTaskFilePath: () => '/tmp/f',
    resolveOutputPath: () => '/tmp/out',
    runCodeRunner: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    isCancellationError: () => false,
  };
  return { ctx: buildStageStepContext(params, 0), instance };
}

test('handleStageExecutionError maps llm-context-overflow', () => {
  const stage: Stage = {
    id: 'stage_a',
    title: 'A',
    tool: 'llm-text',
    toolConfig: { type: 'llm-text', systemPrompt: 'x'.repeat(40) },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'out', format: 'markdown' }],
    pauseAfter: false,
  };
  const { ctx, instance } = ctxForStage(stage);
  const outcome = handleStageExecutionError(ctx, new Error('llm-context-overflow'), 1);
  assert.equal(outcome, 'failed');
  assert.equal(instance.stageRuntimes[0]!.status, 'error');
});

test('handleStageExecutionError maps impl-hollow-output', () => {
  const stage: Stage = {
    id: 'stage_impl_x',
    title: 'I',
    tool: 'llm-text',
    toolConfig: { type: 'llm-text', systemPrompt: 'x'.repeat(40) },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'implCode', format: 'markdown' }],
    pauseAfter: false,
  };
  const { ctx } = ctxForStage(stage);
  const outcome = handleStageExecutionError(ctx, implHollowOutput('impl-hollow-output: empty'), 1);
  assert.equal(outcome, 'failed');
  assert.ok(String(ctx.runtime.outputs._implExecNote).includes('空洞'));
});
