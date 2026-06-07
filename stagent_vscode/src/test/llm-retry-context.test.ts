import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Stage, WorkflowDefinition, WorkflowInstance } from '../WorkflowDefinition';
import type { ExecuteNextStageLoopParams } from '../WorkflowExecutorTypes';
import { buildStageStepContext } from '../stage-runners/StageStepContext';
import { invokeLlmTextForStage } from '../stage-runners/LlmTextInvokeStep';

function makeStage(partial: Partial<Stage> & Pick<Stage, 'id' | 'title'>): Stage {
  const { id, title, ...rest } = partial;
  return {
    id,
    title,
    tool: 'llm-text',
    toolConfig: { type: 'llm-text', systemPrompt: 'BASE_PROMPT' },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'out', format: 'text' }],
    pauseAfter: false,
    ...rest,
  };
}

function tddSliceInstance(): WorkflowInstance {
  const definition: WorkflowDefinition = {
    id: 'wf',
    version: '2.0',
    meta: { title: 't', taskType: 'software', userInput: 'u', createdAt: '2026-01-01T00:00:00.000Z' },
    stages: [
      makeStage({ id: 'stage_decide', title: 'd', isDecisionStage: true }),
      makeStage({ id: 'stage_test_write', title: 'write' }),
      makeStage({
        id: 'stage_test_run',
        title: 'run',
        tool: 'code-runner',
        toolConfig: { type: 'code-runner', command: 'npm test', captureOutput: true },
      }),
    ],
  };
  return {
    definition,
    currentStageIndex: 1,
    status: 'failed',
    stageRuntimes: [
      { stageId: 'stage_decide', status: 'done', outputs: {}, retryCount: 0 },
      { stageId: 'stage_test_write', status: 'pending', outputs: {}, retryCount: 1 },
      {
        stageId: 'stage_test_run',
        status: 'error',
        outputs: {},
        retryCount: 0,
        lastFailureSnapshot: {
          capturedAt: '2026-01-01T00:00:00.000Z',
          errorType: 'tool-execution-failed',
          exitCode: 1,
          stderr: 'UNIQUE_TEST_FAILURE_MARKER',
          outputs: {},
        },
      },
    ],
  };
}

test('invokeLlmTextForStage injects same-slice failed test_run snapshot into system prompt', async () => {
  const instance = tddSliceInstance();
  const stage = instance.definition.stages[1]!;
  let capturedSystem = '';
  const params: ExecuteNextStageLoopParams = {
    instance,
    panel: {},
    currentInstanceKey: 'k1',
    setCurrentInstanceKey: () => {},
    evaluateSkipCondition: () => false,
    postMessage: () => {},
    scheduleSave: () => {},
    debugLog: () => {},
    primaryOutputKey: () => 'out',
    ensureTaskDir: () => '/tmp/task',
    resolveInput: async () => 'user input',
    executeLlmText: async (_stageId, systemPrompt) => {
      capturedSystem = systemPrompt;
      return 'llm output';
    },
    applyPatchInstructions: async () => {},
    resolveTaskFilePath: () => '/tmp/task/file',
    resolveOutputPath: () => '/tmp/task/out',
    runCodeRunner: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    isCancellationError: () => false,
  };
  const ctx = buildStageStepContext(params, 1);
  await invokeLlmTextForStage(ctx, 1, params.panel);
  assert.match(capturedSystem, /BASE_PROMPT/);
  assert.match(capturedSystem, /UNIQUE_TEST_FAILURE_MARKER/);
  assert.equal(ctx.runtime.retryComment, undefined);
});

test('invokeLlmTextForStage prefers user retryComment over snapshot stderr', async () => {
  const instance = tddSliceInstance();
  instance.stageRuntimes[1]!.retryComment = 'USER_ONLY_HINT';
  let capturedSystem = '';
  const params: ExecuteNextStageLoopParams = {
    instance,
    panel: {},
    currentInstanceKey: 'k1',
    setCurrentInstanceKey: () => {},
    evaluateSkipCondition: () => false,
    postMessage: () => {},
    scheduleSave: () => {},
    debugLog: () => {},
    primaryOutputKey: () => 'out',
    ensureTaskDir: () => '/tmp/task',
    resolveInput: async () => 'user input',
    executeLlmText: async (_stageId, systemPrompt) => {
      capturedSystem = systemPrompt;
      return 'llm output';
    },
    applyPatchInstructions: async () => {},
    resolveTaskFilePath: () => '/tmp/task/file',
    resolveOutputPath: () => '/tmp/task/out',
    runCodeRunner: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    isCancellationError: () => false,
  };
  const ctx = buildStageStepContext(params, 1);
  await invokeLlmTextForStage(ctx, 1, params.panel);
  assert.match(capturedSystem, /USER_ONLY_HINT/);
  assert.doesNotMatch(capturedSystem, /UNIQUE_TEST_FAILURE_MARKER/);
});
