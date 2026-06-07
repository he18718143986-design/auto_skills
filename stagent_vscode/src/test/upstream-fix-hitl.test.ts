import './install-vscode-stub';
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { BackendMessage, Stage, WorkflowDefinition, WorkflowInstance } from '../WorkflowDefinition';
import type { HitlCoordinatorHost } from '../hitl/HitlCoordinatorHost';
import { handleUpstreamFix } from '../retry/UpstreamFix';

const PANEL = {} as never;

interface HostCalls {
  messages: BackendMessage[];
  userActions: Array<{ kind: string; detail: Record<string, unknown> }>;
  saved: number;
  executed: number;
}

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

function failedTestRunInstance(): WorkflowInstance {
  const definition: WorkflowDefinition = {
    id: 'wf',
    version: '2.0',
    meta: { title: 't', taskType: 'software', userInput: 'u', createdAt: '' },
    stages: [
      makeStage({ id: 'stage_decide', title: 'd', isDecisionStage: true }),
      makeStage({ id: 'stage_impl_chat', title: 'impl' }),
      makeStage({ id: 'stage_test_write_chat_integration', title: 'write' }),
      makeStage({
        id: 'stage_test_run_chat_integration',
        title: 'run',
        tool: 'code-runner',
        toolConfig: { type: 'code-runner', command: 'npm test', captureOutput: true },
      }),
    ],
  };
  return {
    definition,
    currentStageIndex: 3,
    status: 'failed',
    stageRuntimes: [
      { stageId: 'stage_decide', status: 'done', outputs: {}, retryCount: 0 },
      { stageId: 'stage_impl_chat', status: 'done', outputs: { implCode: 'old' }, retryCount: 0 },
      { stageId: 'stage_test_write_chat_integration', status: 'done', outputs: { out: 't' }, retryCount: 0 },
      {
        stageId: 'stage_test_run_chat_integration',
        status: 'error',
        outputs: {},
        retryCount: 0,
        lastFailureSnapshot: {
          capturedAt: '2026-01-01T00:00:00.000Z',
          errorType: 'tool-execution-failed',
          exitCode: 1,
          stderr: 'assertion failed',
          outputs: {},
        },
      },
    ],
  };
}

function makeHost(instance?: WorkflowInstance, maxRetries = 3): { host: HitlCoordinatorHost; calls: HostCalls } {
  const calls: HostCalls = { messages: [], userActions: [], saved: 0, executed: 0 };
  const host: HitlCoordinatorHost = {
    bindPanel: () => {},
    getInstance: () => instance,
    postMessage: (_p, msg) => {
      calls.messages.push(msg);
    },
    logUserAction: (kind, detail) => {
      calls.userActions.push({ kind, detail });
    },
    markStageArtifactsApproved: () => {},
    scheduleSave: () => {
      calls.saved += 1;
    },
    persistMilestone: () => {},
    executeNextStage: async () => {
      calls.executed += 1;
    },
    ensureInstanceBound: () => true,
    rejectApproveDecision: () => {},
    isDecisionContentLintVscodeDefault: () => true,
    getMaxManualStageRetries: () => maxRetries,
    getWorkspaceRootAbsolute: () => undefined,
    debugLog: () => {},
    warn: () => {},
    error: () => {},
    bumpCurrentStageIndex: () => {},
    setCurrentStageIndex: (i) => {
      if (instance) {
        instance.currentStageIndex = i;
      }
    },
    setInstanceStatus: (s) => {
      if (instance) {
        instance.status = s;
      }
    },
  };
  return { host, calls };
}

describe('handleUpstreamFix', () => {
  it('happy path: impl pending, test_run pending, test_write stays done, executes', async () => {
    const instance = failedTestRunInstance();
    const { host, calls } = makeHost(instance);
    const result = await handleUpstreamFix(host, 'stage_test_run_chat_integration', PANEL);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.targetImplStageId, 'stage_impl_chat');
    }
    assert.equal(instance.stageRuntimes[1]!.status, 'pending');
    assert.equal(instance.stageRuntimes[1]!.retryCount, 1);
    assert.equal(instance.stageRuntimes[2]!.status, 'done');
    assert.equal(instance.stageRuntimes[3]!.status, 'pending');
    assert.ok(instance.stageRuntimes[1]!.lastFailureSnapshot?.stderr?.includes('assertion failed'));
    assert.ok(calls.messages.some((m) => m.type === 'upstreamFixStarted'));
    assert.equal(calls.executed, 1);
    assert.equal(instance.currentStageIndex, 1);
    assert.equal(instance.status, 'running');
  });

  it('rejects exitCode 127 environment failure', async () => {
    const instance = failedTestRunInstance();
    instance.stageRuntimes[3]!.lastFailureSnapshot = {
      capturedAt: 'x',
      errorType: 'tool-execution-failed',
      exitCode: 127,
      stderr: 'flutter not found',
      outputs: {},
    };
    const { host, calls } = makeHost(instance);
    const result = await handleUpstreamFix(host, 'stage_test_run_chat_integration', PANEL);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, 'not-eligible');
    }
    assert.equal(calls.executed, 0);
  });

  it('rejects when impl retry limit exhausted', async () => {
    const instance = failedTestRunInstance();
    instance.stageRuntimes[1]!.retryCount = 3;
    const { host, calls } = makeHost(instance, 3);
    const result = await handleUpstreamFix(host, 'stage_test_run_chat_integration', PANEL);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, 'retry-limit-exceeded');
    }
    assert.equal(calls.executed, 0);
  });
});
