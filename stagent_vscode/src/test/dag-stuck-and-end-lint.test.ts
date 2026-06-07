import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BackendMessage, WorkflowDefinition, WorkflowInstance, StageRuntime } from '../WorkflowDefinition';
import type { ExecuteNextStageLoopParams } from '../WorkflowExecutorTypes';
import { failDagStuckPending, completeDagWorkflow } from '../executor-loop/dag/completeAndFail';
import { runEndContractLintSafely } from '../executor-loop/StageStepDriver';

function stage(id: string) {
  return {
    id,
    title: id,
    tool: 'llm-text' as const,
    toolConfig: { type: 'llm-text' as const, systemPrompt: 'x' },
    input: { sources: [], mergeStrategy: 'concat' as const },
    outputs: [{ key: `${id}_out`, format: 'markdown' as const }],
    pauseAfter: false,
  };
}

function buildParams(
  stageIds: string[],
  statuses: StageRuntime['status'][],
): { params: ExecuteNextStageLoopParams; posted: BackendMessage[]; instance: WorkflowInstance } {
  const wf: WorkflowDefinition = {
    id: 'wf-1',
    version: '2.0',
    meta: { title: 't', taskType: 'software', userInput: 'in', createdAt: '2026-01-01T00:00:00.000Z' },
    stages: stageIds.map(stage),
  };
  const instance: WorkflowInstance = {
    definition: wf,
    stageRuntimes: stageIds.map((id, i) => ({ stageId: id, status: statuses[i], outputs: {}, retryCount: 0 })),
    status: 'running',
    currentStageIndex: 0,
  };
  const posted: BackendMessage[] = [];
  const params: ExecuteNextStageLoopParams = {
    instance,
    panel: {} as never,
    currentInstanceKey: 'k',
    setCurrentInstanceKey: () => {},
    evaluateSkipCondition: () => false,
    postMessage: (_p, msg) => posted.push(msg),
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
  return { params, posted, instance };
}

test('failDagStuckPending fails the workflow when an errored stage blocks downstream (no pending)', () => {
  const { params, posted, instance } = buildParams(['s1', 's2'], ['error', 'done']);
  failDagStuckPending(params);
  assert.equal(instance.status, 'failed');
  const failed = posted.filter((m) => m.type === 'workflowFailed');
  assert.equal(failed.length, 1, 'should post workflowFailed instead of hanging silently');
  assert.equal((failed[0] as Extract<BackendMessage, { type: 'workflowFailed' }>).stageId, 's1');
});

test('failDagStuckPending still fails a pending stage when one exists', () => {
  const { params, posted, instance } = buildParams(['s1', 's2'], ['done', 'pending']);
  failDagStuckPending(params);
  assert.equal(instance.status, 'failed');
  assert.equal(instance.stageRuntimes[1]!.status, 'error');
  assert.ok(posted.some((m) => m.type === 'stageError'));
});

test('completeDagWorkflow surfaces end-contract lint failure as a completion warning', async () => {
  const { params, posted, instance } = buildParams(['s1'], ['done']);
  params.preRunEndContractLint = async () => {
    throw new Error('boom-lint');
  };
  await completeDagWorkflow(params, 1);
  assert.equal(instance.status, 'completed');
  const completed = posted.filter((m) => m.type === 'workflowCompleted');
  assert.equal(completed.length, 1);
  const warnings = (completed[0] as Extract<BackendMessage, { type: 'workflowCompleted' }>).warnings ?? [];
  assert.ok(warnings.some((w) => w.includes('boom-lint')), 'completion should carry the lint failure text');
});

test('runEndContractLintSafely returns warnings on success and error text on throw', async () => {
  const ok = buildParams(['s1'], ['done']);
  ok.params.preRunEndContractLint = async () => ['w1', 'w2'];
  assert.deepEqual(await runEndContractLintSafely(ok.params), ['w1', 'w2']);

  const bad = buildParams(['s1'], ['done']);
  bad.params.preRunEndContractLint = async () => {
    throw new Error('lint-crash');
  };
  const out = await runEndContractLintSafely(bad.params);
  assert.equal(out.length, 1);
  assert.ok(out[0]!.includes('lint-crash'));
});
