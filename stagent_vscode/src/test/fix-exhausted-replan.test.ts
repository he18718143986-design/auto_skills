import './install-vscode-stub';
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import type { Stage, WorkflowInstance } from '../WorkflowDefinition';
import { CODE_RUNNER_EXIT_OUTPUT_KEY } from '../WorkflowOutputKeys';
import {
  DEFAULT_FIX_EXHAUSTED_MAX_ATTEMPTS,
  applyRuntimeReplan,
  isFixExhausted,
  mergeFixChainLedger,
  planDeterministicReplan,
  readReplanLedger,
  tryRuntimeReplanFromFixExhausted,
} from '../runtime-replan';
import { trySelfHealAfterTestRunFailure } from '../runtime-replan/testRunSelfHeal';
import { ERROR_TYPE_TOOL_EXECUTION_FAILED } from '../errors/stageErrorBuilders';
import { toolExecutionFailed } from '../ErrorTypeUtils';
import { buildStageStepContext } from '../stage-runners/StageStepContext';
import type { ExecuteNextStageLoopParams } from '../WorkflowExecutorTypes';

function meta() {
  return {
    title: 't',
    taskType: 'software' as const,
    userInput: 'u',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function sliceWithFixChain(): WorkflowInstance {
  const impl: Stage = {
    id: 'stage_impl_market_connector',
    title: 'impl',
    tool: 'llm-text',
    toolConfig: { type: 'llm-text', systemPrompt: 'x', writeOutputToFile: 'market_connector.py' },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'out', format: 'text' }],
    pauseAfter: false,
  };
  const testRun: Stage = {
    id: 'stage_test_run_market_connector',
    title: 'test',
    tool: 'code-runner',
    toolConfig: {
      type: 'code-runner',
      command: '.venv/bin/pytest tests/test_market_connector.py -v',
      captureOutput: true,
    },
    dependsOn: ['stage_impl_market_connector'],
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'verifyOut', format: 'text' }],
    pauseAfter: false,
  };
  const fix: Stage = {
    id: 'stage_fix_if_failed_market_connector',
    title: 'fix',
    tool: 'llm-text',
    toolConfig: {
      type: 'llm-text',
      systemPrompt: 'fix',
      writeOutputToFile: 'market_connector.py',
    },
    dependsOn: ['stage_test_run_market_connector'],
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'fixPatch', format: 'text' }],
    pauseAfter: false,
  };
  const stages = [impl, testRun, fix];
  const instance: WorkflowInstance = {
    definition: { id: 'wf', version: '2.0', meta: meta(), stages },
    stageRuntimes: stages.map((s, i) => ({
      stageId: s.id,
      status: i === 0 ? 'done' : i === 1 ? 'running' : 'pending',
      outputs:
        s.id === 'stage_test_run_market_connector'
          ? { [CODE_RUNNER_EXIT_OUTPUT_KEY]: 1, stdout: 'FAILED', stderr: '' }
          : {},
      retryCount: 0,
    })),
    currentStageIndex: 1,
    status: 'running',
  };
  return instance;
}

test('P3d: isFixExhausted when fix attempts reach max and test_run still red', () => {
  const instance = sliceWithFixChain();
  const testRt = instance.stageRuntimes.find((r) => r.stageId === 'stage_test_run_market_connector')!;
  mergeFixChainLedger(testRt, { attempts: DEFAULT_FIX_EXHAUSTED_MAX_ATTEMPTS });
  assert.equal(isFixExhausted(testRt), true);
  mergeFixChainLedger(testRt, { attempts: 0 });
  assert.equal(isFixExhausted(testRt), false);
});

test('P3d: planDeterministicReplan inserts fix replan stage after fix_if_failed', () => {
  const instance = sliceWithFixChain();
  const action = planDeterministicReplan({
    trigger: {
      kind: 'fix-exhausted',
      testRunStageId: 'stage_test_run_market_connector',
      sliceSemantic: 'market_connector',
      message: 'pytest failed',
    },
    instance,
    gateRepairWriteTarget: 'market_connector.py',
  });
  assert.ok(action);
  assert.equal(action!.anchorStageId, 'stage_fix_if_failed_market_connector');
  assert.match(action!.stage.id, /^stage_runtime_replan_fix_market_connector$/);
});

test('P3d: tryRuntimeReplanFromFixExhausted splices replan stage and defers test_run', () => {
  const instance = sliceWithFixChain();
  const testRun = instance.definition.stages[1]!;
  const fix = instance.definition.stages[2]!;
  const testRt = instance.stageRuntimes.find((r) => r.stageId === testRun.id)!;
  mergeFixChainLedger(testRt, { attempts: DEFAULT_FIX_EXHAUSTED_MAX_ATTEMPTS });

  const posted: unknown[] = [];
  const params: ExecuteNextStageLoopParams = {
    instance,
    panel: {},
    currentInstanceKey: 'k',
    setCurrentInstanceKey: () => {},
    evaluateSkipCondition: () => false,
    postMessage: (_p, msg) => posted.push(msg),
    scheduleSave: () => {},
    debugLog: () => {},
    logUserAction: () => {},
    primaryOutputKey: (s) => s.outputs[0]?.key ?? 'out',
    ensureTaskDir: () => '/tmp',
    resolveInput: async () => '',
    executeLlmText: async () => 'ok',
    applyPatchInstructions: async () => {},
    resolveTaskFilePath: () => '/tmp/f',
    resolveOutputPath: (_k, rel) => `/tmp/${rel}`,
    runCodeRunner: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    isCancellationError: () => false,
  };

  const outcome = tryRuntimeReplanFromFixExhausted({
    loopParams: params,
    testRunStage: testRun,
    fixStage: fix,
    attempt: 0,
  });
  assert.equal(outcome, 'replan');
  assert.equal(params.instance.definition.stages.length, 4);
  assert.match(params.instance.definition.stages[3]!.id, /^stage_runtime_replan_fix_/);
  assert.equal(testRt.status, 'pending');
});

test('P3d: trySelfHealAfterTestRunFailure continues workflow when fix chain exists', () => {
  const instance = sliceWithFixChain();
  const ctx = buildStageStepContext(
    {
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
      resolveTaskFilePath: () => '/tmp',
      resolveOutputPath: () => '/tmp',
      runCodeRunner: async () => ({ exitCode: 1, stdout: 'fail', stderr: '' }),
      isCancellationError: () => false,
    },
    1,
  );
  const err = toolExecutionFailed('exitCode=1');
  const outcome = trySelfHealAfterTestRunFailure(
    ctx,
    ERROR_TYPE_TOOL_EXECUTION_FAILED,
    {
      stageId: ctx.stage.id,
      errorType: ERROR_TYPE_TOOL_EXECUTION_FAILED,
      error: err.message,
    },
    1,
  );
  assert.equal(outcome, 'continue');
  assert.equal(ctx.runtime.status, 'done');
  assert.equal(ctx.instance.status, 'running');
  assert.equal(ctx.runtime.outputs[CODE_RUNNER_EXIT_OUTPUT_KEY], 1);
});

test('P3d: applyRuntimeReplan fix-exhausted records ledger on test_run', () => {
  const instance = sliceWithFixChain();
  const plan = planDeterministicReplan({
    trigger: {
      kind: 'fix-exhausted',
      testRunStageId: 'stage_test_run_market_connector',
      sliceSemantic: 'market_connector',
    },
    instance,
    gateRepairWriteTarget: 'market_connector.py',
  });
  assert.ok(plan);
  const applied = applyRuntimeReplan(instance, plan!);
  assert.equal(applied.ok, true);
  if (!applied.ok) {
    return;
  }
  const testRt = applied.instance.stageRuntimes.find(
    (r) => r.stageId === 'stage_test_run_market_connector',
  );
  assert.ok(testRt);
  const ledger = readReplanLedger(testRt!.outputs);
  assert.equal(ledger.attempts, 1);
  assert.equal(ledger.lastTrigger, 'fix-exhausted');
});
