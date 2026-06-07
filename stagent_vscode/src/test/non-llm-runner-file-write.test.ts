import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  FileWriteConfig,
  Stage,
  StageRuntime,
  WorkflowInstance,
} from '../WorkflowDefinition';
import type { NonLlmToolExecutionParams } from '../execution-bindings/executor-loop-types';
import { runFileWriteTool } from '../non-llm-runners/file-write';
import { StagentError } from '../ErrorTypeUtils';

function fileWriteStage(cfg: Partial<FileWriteConfig>): Stage {
  return {
    id: 'stage_write',
    title: 'write',
    tool: 'file-write',
    toolConfig: {
      type: 'file-write',
      filePath: 'out.txt',
      sourceOutputKey: 'src',
      ...cfg,
    },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'written', format: 'text' }],
    pauseAfter: false,
  } as unknown as Stage;
}

interface Harness {
  params: NonLlmToolExecutionParams;
  runtime: StageRuntime;
  dir: string;
  tracked: Array<Record<string, unknown>>;
}

function makeHarness(
  stage: Stage,
  sourceOutputs: Record<string, unknown>,
  opts?: { resolveOutputPath?: NonLlmToolExecutionParams['resolveOutputPath'] },
): Harness {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-'));
  const writeRuntime: StageRuntime = {
    stageId: stage.id,
    status: 'running',
    outputs: {},
    retryCount: 0,
  } as unknown as StageRuntime;
  const sourceRuntime: StageRuntime = {
    stageId: 'stage_src',
    status: 'completed',
    outputs: sourceOutputs,
    retryCount: 0,
  } as unknown as StageRuntime;
  const sourceStage = { id: 'stage_src', title: 'src', tool: 'llm-text' } as unknown as Stage;
  const instance: WorkflowInstance = {
    definition: {
      id: 'wf',
      version: '2.0',
      meta: { title: 't', taskType: 'software', userInput: '', createdAt: '' },
      stages: [sourceStage, stage],
    },
    currentStageIndex: 1,
    stageRuntimes: [sourceRuntime, writeRuntime],
    status: 'running',
  } as unknown as WorkflowInstance;
  const tracked: Array<Record<string, unknown>> = [];
  const params: NonLlmToolExecutionParams = {
    stage,
    runtime: writeRuntime,
    outKey: 'written',
    instance,
    instanceKey: 'inst-1',
    resolveTaskFilePath: (_k, rel) => path.join(dir, rel),
    resolveOutputPath: opts?.resolveOutputPath ?? ((_k, rel) => path.join(dir, rel)),
    runCodeRunner: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    stageIndex: 1,
    trackPersistedFile: (input) => tracked.push(input as Record<string, unknown>),
  };
  return { params, runtime: writeRuntime, dir, tracked };
}

test('runFileWriteTool writes source content atomically and tracks the persisted file', async () => {
  const stage = fileWriteStage({ filePath: 'out.txt', sourceOutputKey: 'src' });
  const { params, runtime, dir, tracked } = makeHarness(stage, { src: 'hello world' });
  const result = await runFileWriteTool(params);
  assert.equal(result, true);
  const target = path.join(dir, 'out.txt');
  assert.equal(fs.readFileSync(target, 'utf-8'), 'hello world');
  assert.equal(runtime.outputs.written, target);
  assert.equal(tracked.length, 1);
  assert.equal(tracked[0].existedBefore, false);
});

test('runFileWriteTool records prior content when overwriting an existing file', async () => {
  const stage = fileWriteStage({ filePath: 'out.txt', sourceOutputKey: 'src' });
  const { params, dir, tracked } = makeHarness(stage, { src: 'new content' });
  fs.writeFileSync(path.join(dir, 'out.txt'), 'old content', 'utf-8');
  await runFileWriteTool(params);
  assert.equal(fs.readFileSync(path.join(dir, 'out.txt'), 'utf-8'), 'new content');
  assert.equal(tracked[0].existedBefore, true);
  assert.equal(tracked[0].priorContent, 'old content');
});

test('runFileWriteTool throws invariant-violation when filePath is missing', async () => {
  const stage = fileWriteStage({ filePath: '  ' });
  const { params } = makeHarness(stage, { src: 'x' });
  await assert.rejects(
    () => runFileWriteTool(params),
    (e: unknown) => e instanceof StagentError && e.errorType === 'invariant-violation',
  );
});

test('runFileWriteTool throws invariant-violation when sourceOutputKey is missing', async () => {
  const stage = fileWriteStage({ sourceOutputKey: '' });
  const { params } = makeHarness(stage, { src: 'x' });
  await assert.rejects(
    () => runFileWriteTool(params),
    (e: unknown) => e instanceof StagentError && e.errorType === 'invariant-violation',
  );
});

test('runFileWriteTool throws when the source output cannot be found', async () => {
  const stage = fileWriteStage({ sourceOutputKey: 'missing' });
  const { params } = makeHarness(stage, { other: 'x' });
  await assert.rejects(
    () => runFileWriteTool(params),
    /file-write source output not found/,
  );
});

test('runFileWriteTool propagates resolveOutputPath rejection (out-of-bounds path)', async () => {
  const stage = fileWriteStage({ filePath: '../escape.txt', sourceOutputKey: 'src' });
  const { params } = makeHarness(
    stage,
    { src: 'x' },
    {
      resolveOutputPath: () => {
        throw new Error('path escapes workspace root');
      },
    },
  );
  await assert.rejects(() => runFileWriteTool(params), /escapes workspace root/);
});
