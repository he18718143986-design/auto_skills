import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  CodeRunnerConfig,
  Stage,
  StageRuntime,
  WorkflowInstance,
} from '../WorkflowDefinition';
import type {
  CodeRunnerResult,
  NonLlmToolExecutionParams,
} from '../execution-bindings/executor-loop-types';
import { runCodeRunnerTool } from '../non-llm-runners/code-runner';
import { StagentError } from '../ErrorTypeUtils';
import { CODE_RUNNER_EXIT_OUTPUT_KEY } from '../WorkflowOutputKeys';

function codeRunnerStage(cfg: Partial<CodeRunnerConfig>): Stage {
  return {
    id: 'stage_run',
    title: 'run',
    tool: 'code-runner',
    toolConfig: { type: 'code-runner', command: 'echo hi', captureOutput: true, ...cfg },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'out', format: 'text' }],
    pauseAfter: false,
  } as unknown as Stage;
}

function makeParams(
  stage: Stage,
  runCodeRunner: NonLlmToolExecutionParams['runCodeRunner'],
): { params: NonLlmToolExecutionParams; runtime: StageRuntime } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-'));
  const runtime: StageRuntime = {
    stageId: stage.id,
    status: 'running',
    outputs: {},
    retryCount: 0,
  } as unknown as StageRuntime;
  const instance: WorkflowInstance = {
    definition: {
      id: 'wf',
      version: '2.0',
      meta: { title: 't', taskType: 'software', userInput: '', createdAt: '' },
      stages: [stage],
    },
    currentStageIndex: 0,
    stageRuntimes: [runtime],
    status: 'running',
  } as unknown as WorkflowInstance;
  const params: NonLlmToolExecutionParams = {
    stage,
    runtime,
    outKey: 'out',
    instance,
    instanceKey: 'inst-1',
    resolveTaskFilePath: (_k, rel) => path.join(dir, rel),
    resolveOutputPath: (_k, rel) => path.join(dir, rel),
    runCodeRunner,
    stageIndex: 0,
  };
  return { params, runtime };
}

const ok = (exitCode: number, stdout = '', stderr = ''): CodeRunnerResult => ({
  exitCode,
  stdout,
  stderr,
});

test('runCodeRunnerTool populates outputs and returns true on success', async () => {
  const stage = codeRunnerStage({ command: 'echo hi', captureOutput: true });
  const { params, runtime } = makeParams(stage, async () => ok(0, 'hello', ''));
  const result = await runCodeRunnerTool(params);
  assert.equal(result, true);
  assert.equal(runtime.outputs[CODE_RUNNER_EXIT_OUTPUT_KEY], 0);
  assert.equal(runtime.outputs.stdout, 'hello');
  assert.equal(runtime.outputs.out, 'hello');
});

test('runCodeRunnerTool joins stdout+stderr when captureOutput is true', async () => {
  const stage = codeRunnerStage({ command: 'echo hi', captureOutput: true });
  const { params, runtime } = makeParams(stage, async () => ok(0, 'out-text', 'err-text'));
  await runCodeRunnerTool(params);
  assert.equal(runtime.outputs.out, 'out-text\nerr-text');
});

test('runCodeRunnerTool reports exitCode summary when captureOutput is false', async () => {
  const stage = codeRunnerStage({ command: 'echo hi', captureOutput: false });
  const { params, runtime } = makeParams(stage, async () => ok(0, 'ignored', ''));
  await runCodeRunnerTool(params);
  assert.equal(runtime.outputs.out, 'exitCode=0');
});

test('runCodeRunnerTool throws tool-execution-failed on non-zero exit (outputs still set)', async () => {
  const stage = codeRunnerStage({ command: 'echo hi', captureOutput: true });
  const { params, runtime } = makeParams(stage, async () => ok(2, 'partial', 'boom'));
  await assert.rejects(
    () => runCodeRunnerTool(params),
    (e: unknown) => e instanceof StagentError && e.errorType === 'tool-execution-failed',
  );
  assert.equal(runtime.outputs[CODE_RUNNER_EXIT_OUTPUT_KEY], 2);
  assert.equal(runtime.outputs.stderr, 'boom');
});

test('runCodeRunnerTool throws invariant-violation when command is missing', async () => {
  const stage = codeRunnerStage({ command: '   ' });
  const { params } = makeParams(stage, async () => ok(0));
  await assert.rejects(
    () => runCodeRunnerTool(params),
    (e: unknown) => e instanceof StagentError && e.errorType === 'invariant-violation',
  );
});
