import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Stage, StageRuntime, WorkflowDefinition, WorkflowInstance } from '../WorkflowDefinition';
import { FAILURE_SNAPSHOT_STDIO_MAX } from '../LogPreviewLimits';
import {
  buildAutoRetryComment,
  captureFailureSnapshot,
  resolveEffectiveRetryComment,
  truncateSnapshotText,
} from '../retry/FailureSnapshot';
import { CODE_RUNNER_EXIT_OUTPUT_KEY } from '../WorkflowOutputKeys';

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

describe('FailureSnapshot', () => {
  it('truncateSnapshotText keeps tail within limit', () => {
    const long = 'a'.repeat(FAILURE_SNAPSHOT_STDIO_MAX + 100);
    const truncated = truncateSnapshotText(long)!;
    assert.equal(truncated.length, FAILURE_SNAPSHOT_STDIO_MAX);
    assert.ok(truncated.endsWith('a'.repeat(100)));
  });

  it('captureFailureSnapshot writes exitCode, stderr truncation, and preserves retryCount on runtime', () => {
    const runtime: StageRuntime = {
      stageId: 'stage_test_run',
      status: 'error',
      outputs: {
        [CODE_RUNNER_EXIT_OUTPUT_KEY]: 1,
        stderr: 'x'.repeat(FAILURE_SNAPSHOT_STDIO_MAX + 50),
      },
      retryCount: 2,
    };
    const snap = captureFailureSnapshot(runtime, {
      stageId: 'stage_test_run',
      errorType: 'tool-execution-failed',
      error: 'tool-execution-failed: code-runner exitCode=1',
      stderr: 'y'.repeat(FAILURE_SNAPSHOT_STDIO_MAX + 20),
    });
    assert.equal(snap.exitCode, 1);
    assert.equal(snap.stderr!.length, FAILURE_SNAPSHOT_STDIO_MAX);
    assert.equal(runtime.retryCount, 2);
    assert.equal(runtime.lastFailureSnapshot, snap);
    assert.equal(snap.outputs[CODE_RUNNER_EXIT_OUTPUT_KEY], 1);
  });

  it('captureFailureSnapshot prefers _exitCode output over parsed error text', () => {
    const runtime: StageRuntime = {
      stageId: 's1',
      status: 'error',
      outputs: { [CODE_RUNNER_EXIT_OUTPUT_KEY]: 127 },
      retryCount: 0,
    };
    const snap = captureFailureSnapshot(runtime, {
      stageId: 's1',
      errorType: 'tool-execution-failed',
      error: 'tool-execution-failed: code-runner exitCode=1',
    });
    assert.equal(snap.exitCode, 127);
  });

  it('captureFailureSnapshot parses exitCode from error when output missing', () => {
    const runtime: StageRuntime = {
      stageId: 's1',
      status: 'error',
      outputs: {},
      retryCount: 0,
    };
    const snap = captureFailureSnapshot(runtime, {
      stageId: 's1',
      errorType: 'tool-execution-failed',
      error: 'tool-execution-failed: code-runner exitCode=127',
      stderr: 'flutter: command not found',
    });
    assert.equal(snap.exitCode, 127);
  });

  it('buildAutoRetryComment includes errorType, exitCode, and stderr snippet', () => {
    const comment = buildAutoRetryComment({
      capturedAt: '2026-01-01T00:00:00.000Z',
      errorType: 'tool-execution-failed',
      exitCode: 1,
      stderr: 'ImportError: missing module',
      outputs: {},
    });
    assert.match(comment, /errorType=tool-execution-failed/);
    assert.match(comment, /exitCode=1/);
    assert.match(comment, /ImportError: missing module/);
  });

  it('buildAutoRetryComment for exitCode 127 includes environment hint', () => {
    const comment = buildAutoRetryComment(
      {
        capturedAt: '2026-01-01T00:00:00.000Z',
        errorType: 'tool-execution-failed',
        exitCode: 127,
        stderr: 'env: flutter: No such file or directory',
        error: 'tool-execution-failed: code-runner exitCode=127',
        outputs: {},
      },
      'stage_test_run_chat_ui',
    );
    assert.match(comment, /flutter/i);
    assert.match(comment, /exitCode=127/);
  });

  it('resolveEffectiveRetryComment prefers user comment', () => {
    const instance: WorkflowInstance = {
      definition: {
        id: 'wf',
        version: '2.0',
        meta: { title: 't', taskType: 'software', userInput: 'u', createdAt: '' },
        stages: [makeStage({ id: 'stage_impl', title: 'impl' })],
      },
      currentStageIndex: 0,
      status: 'failed',
      stageRuntimes: [
        {
          stageId: 'stage_impl',
          status: 'error',
          outputs: {},
          retryCount: 0,
          lastFailureSnapshot: {
            capturedAt: 'x',
            stderr: 'AUTO_SHOULD_NOT_APPEAR',
            outputs: {},
          },
        },
      ],
    };
    const comment = resolveEffectiveRetryComment({
      instance,
      stageId: 'stage_impl',
      userComment: '  用户手写  ',
    });
    assert.equal(comment, '用户手写');
  });

  it('resolveEffectiveRetryComment uses own stage snapshot when user comment empty', () => {
    const instance: WorkflowInstance = {
      definition: {
        id: 'wf',
        version: '2.0',
        meta: { title: 't', taskType: 'software', userInput: 'u', createdAt: '' },
        stages: [makeStage({ id: 'stage_impl', title: 'impl' })],
      },
      currentStageIndex: 0,
      status: 'failed',
      stageRuntimes: [
        {
          stageId: 'stage_impl',
          status: 'pending',
          outputs: {},
          retryCount: 1,
          lastFailureSnapshot: {
            capturedAt: 'x',
            errorType: 'llm-invalid-output',
            stderr: 'OWN_STAGE_STDERR',
            outputs: {},
          },
        },
      ],
    };
    const comment = resolveEffectiveRetryComment({
      instance,
      stageId: 'stage_impl',
      userComment: '',
    });
    assert.match(comment, /OWN_STAGE_STDERR/);
  });

  it('resolveEffectiveRetryComment falls back to failed stage in same TDD slice', () => {
    const definition: WorkflowDefinition = {
      id: 'wf',
      version: '2.0',
      meta: { title: 't', taskType: 'software', userInput: 'u', createdAt: '' },
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
    const instance: WorkflowInstance = {
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
            capturedAt: 'x',
            errorType: 'tool-execution-failed',
            exitCode: 1,
            stderr: 'SLICE_FAILED_STDERR',
            outputs: {},
          },
        },
      ],
    };
    const comment = resolveEffectiveRetryComment({
      instance,
      stageId: 'stage_test_write',
      userComment: '',
    });
    assert.match(comment, /SLICE_FAILED_STDERR/);
  });

  it('resolveEffectiveRetryComment does not fall back across TDD slices', () => {
    const definition: WorkflowDefinition = {
      id: 'wf',
      version: '2.0',
      meta: { title: 't', taskType: 'software', userInput: 'u', createdAt: '' },
      stages: [
        makeStage({ id: 'stage_decide_a', title: 'd1', isDecisionStage: true }),
        makeStage({ id: 'stage_test_write_a', title: 'write a' }),
        makeStage({
          id: 'stage_test_run_a',
          title: 'run a',
          tool: 'code-runner',
          toolConfig: { type: 'code-runner', command: 'npm test', captureOutput: true },
        }),
        makeStage({ id: 'stage_decide_b', title: 'd2', isDecisionStage: true }),
        makeStage({ id: 'stage_test_write_b', title: 'write b' }),
      ],
    };
    const instance: WorkflowInstance = {
      definition,
      currentStageIndex: 4,
      status: 'failed',
      stageRuntimes: [
        { stageId: 'stage_decide_a', status: 'done', outputs: {}, retryCount: 0 },
        { stageId: 'stage_test_write_a', status: 'done', outputs: {}, retryCount: 0 },
        {
          stageId: 'stage_test_run_a',
          status: 'error',
          outputs: {},
          retryCount: 0,
          lastFailureSnapshot: {
            capturedAt: 'x',
            stderr: 'OTHER_SLICE_STDERR',
            outputs: {},
          },
        },
        { stageId: 'stage_decide_b', status: 'done', outputs: {}, retryCount: 0 },
        { stageId: 'stage_test_write_b', status: 'pending', outputs: {}, retryCount: 1 },
      ],
    };
    const comment = resolveEffectiveRetryComment({
      instance,
      stageId: 'stage_test_write_b',
      userComment: '',
    });
    assert.equal(comment, '');
  });
});
