import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import type { Stage, WorkflowDefinition, WorkflowInstance } from '../WorkflowDefinition';
import type { ExecuteNextStageLoopParams } from '../WorkflowExecutorTypes';
import { CONFIDENCE_OUTPUT_KEY } from '../ConfidenceScorer';
import { buildStageStepContext } from '../stage-runners/StageStepContext';
import { runLlmTextStage } from '../stage-runners/LlmTextStageRunner';
import { isStageAlreadyHandledError } from '../stage-runners/StageControlSignals';
import { experiencesPath } from '../paths/StagentPaths';
import { appendWorkflowExperienceAsync, EXPERIENCES_FILENAME } from '../WorkflowExperienceStore';

function meta(taskType: string, extra?: { taskWorkspacePath?: string }) {
  return {
    title: 't',
    taskType,
    userInput: 'input',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  };
}

function implStage(): Stage {
  return {
    id: 'stage_impl_demo',
    title: 'impl',
    tool: 'llm-text',
    toolConfig: {
      type: 'llm-text',
      systemPrompt: 'x'.repeat(40),
    },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'implCode', format: 'markdown' }],
    pauseAfter: false,
  };
}

test('runLlmTextStage writes confidence with prior failure pattern from experience store', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stagent-llm-run-'));
  const storePath = experiencesPath(tmp, EXPERIENCES_FILENAME);
  await appendWorkflowExperienceAsync(storePath, {
    id: 'e1',
    timestamp: new Date().toISOString(),
    taskType: 'software',
    completionStatus: 'failed',
    failureStageId: 'stage_impl_demo_old',
    failureErrorType: 'tool-execution-failed',
  });

  const stage = implStage();
  const wf: WorkflowDefinition = {
    id: 'wf-1',
    version: '2.0',
    meta: meta('software', { taskWorkspacePath: tmp }),
    stages: [stage],
  };
  const instance: WorkflowInstance = {
    definition: wf,
    stageRuntimes: [{ stageId: stage.id, status: 'running', outputs: {}, retryCount: 0 }],
    status: 'running',
    currentStageIndex: 0,
    taskDir: path.join(tmp, 'task'),
  };

  const params: ExecuteNextStageLoopParams = {
    instance,
    panel: {},
    currentInstanceKey: 'k1',
    setCurrentInstanceKey: () => {},
    evaluateSkipCondition: () => false,
    postMessage: () => {},
    scheduleSave: () => {},
    debugLog: () => {},
    primaryOutputKey: () => 'implCode',
    ensureTaskDir: () => instance.taskDir!,
    resolveInput: async () => 'user input',
    executeLlmText: async () => '```python\nprint("ok")\n```',
    applyPatchInstructions: async () => {},
    resolveTaskFilePath: () => path.join(tmp, 'f.py'),
    resolveOutputPath: () => path.join(tmp, 'out.py'),
    runCodeRunner: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    isCancellationError: () => false,
    getWorkspaceRoot: () => tmp,
    memoryExperienceEnabled: true,
  };

  const ctx = buildStageStepContext(params, 0);
  await runLlmTextStage(ctx, 1, 'k1');

  const confidence = instance.stageRuntimes[0]!.outputs[CONFIDENCE_OUTPUT_KEY] as {
    reasons?: string[];
  };
  assert.ok(confidence);
  assert.ok(confidence.reasons?.some((r) => /prior failure pattern|历史失败模式/i.test(r)));
});

test('runLlmTextStage fails on invalid patch JSON', async () => {
  const stage: Stage = {
    ...implStage(),
    patchMode: true,
  };
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
  let postedError = false;
  const params: ExecuteNextStageLoopParams = {
    instance,
    panel: {},
    currentInstanceKey: 'k1',
    setCurrentInstanceKey: () => {},
    evaluateSkipCondition: () => false,
    postMessage: (_p, msg) => {
      if (msg.type === 'stageError') {
        postedError = true;
      }
    },
    scheduleSave: () => {},
    debugLog: () => {},
    primaryOutputKey: () => 'implCode',
    ensureTaskDir: () => '/tmp',
    resolveInput: async () => 'in',
    executeLlmText: async () => 'not-json',
    applyPatchInstructions: async () => {},
    resolveTaskFilePath: () => '/tmp/f',
    resolveOutputPath: () => '/tmp/out',
    runCodeRunner: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    isCancellationError: () => false,
  };

  const ctx = buildStageStepContext(params, 0);
  await assert.rejects(
    () => runLlmTextStage(ctx, 1, 'k1'),
    (e: unknown) =>
      isStageAlreadyHandledError(e) && e.reason === 'patch-mode-invalid-json',
  );
  assert.ok(postedError);
  assert.equal(instance.status, 'failed');
});
