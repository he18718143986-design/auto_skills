/**
 * Runtime Replan POC — 纯函数契约测试（见 docs/RUNTIME_REPLAN_SPEC.md）。
 * 执行器接入前，本文件即 P3a 退出标准。
 */
import './install-vscode-stub';
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import type { Stage, WorkflowDefinition, WorkflowInstance } from '../WorkflowDefinition';
import {
  RUNTIME_REPLAN_MARKER,
  RUNTIME_REPLAN_STAGE_ID_PREFIX,
  applyRuntimeReplan,
  canSpendReplanBudget,
  emptyReplanLedger,
  nextLedgerAfterInsert,
  planDeterministicReplan,
  shouldOfferRuntimeReplan,
} from '../runtime-replan';
import { GATE_ID_PYTHON_EXPORT_CONTRACT } from '../QualityGateIds';

function meta() {
  return {
    title: 't',
    taskType: 'software' as const,
    userInput: 'u',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function pythonSliceInstance(): WorkflowInstance {
  const stages: Stage[] = [
    {
      id: 'stage_venv_create',
      title: 'venv',
      tool: 'code-runner',
      toolConfig: { type: 'code-runner', command: 'python3 -m venv .venv', captureOutput: true },
      input: { sources: [], mergeStrategy: 'concat' },
      outputs: [{ key: 'out', format: 'text' }],
      pauseAfter: false,
    },
    {
      id: 'stage_venv_pip_install',
      title: 'pip',
      tool: 'code-runner',
      toolConfig: {
        type: 'code-runner',
        command: '.venv/bin/pip install -r requirements.txt',
        captureOutput: true,
      },
      dependsOn: ['stage_venv_create'],
      input: { sources: [], mergeStrategy: 'concat' },
      outputs: [{ key: 'out', format: 'text' }],
      pauseAfter: false,
    },
    {
      id: 'stage_impl_market_connector',
      title: 'impl',
      tool: 'llm-text',
      toolConfig: {
        type: 'llm-text',
        systemPrompt: 'impl',
        writeOutputToFile: 'market_connector.py',
      },
      input: { sources: [], mergeStrategy: 'concat' },
      outputs: [{ key: 'out', format: 'text' }],
      pauseAfter: false,
    },
    {
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
    },
  ];
  const wf: WorkflowDefinition = {
    id: 'wf-poc',
    version: '2.0',
    meta: meta(),
    stages,
  };
  return {
    definition: wf,
    stageRuntimes: stages.map((s) => ({
      stageId: s.id,
      status: s.id === 'stage_test_run_market_connector' ? ('running' as const) : ('done' as const),
      outputs: {},
      retryCount: 0,
    })),
    currentStageIndex: 3,
    status: 'running',
  };
}

test('POC: planDeterministicReplan inserts pip stage for preflight-pytest-asyncio', () => {
  const instance = pythonSliceInstance();
  const action = planDeterministicReplan({
    trigger: {
      kind: 'preflight-pytest-asyncio',
      testRunStageId: 'stage_test_run_market_connector',
      sliceSemantic: 'market_connector',
    },
    instance,
  });
  assert.ok(action);
  assert.equal(action!.anchorStageId, 'stage_venv_pip_install');
  assert.match(action!.stage.id, /^stage_runtime_replan_pip_pytest_asyncio_/);
  assert.ok(action!.stage.description?.includes(RUNTIME_REPLAN_MARKER));
});

test('POC: applyRuntimeReplan splices stage + runtime and focuses new stage', () => {
  const instance = pythonSliceInstance();
  const plan = planDeterministicReplan({
    trigger: {
      kind: 'preflight-pytest-asyncio',
      testRunStageId: 'stage_test_run_market_connector',
      sliceSemantic: 'market_connector',
    },
    instance,
  });
  assert.ok(plan);
  const result = applyRuntimeReplan(instance, plan!);
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.equal(result.instance.definition.stages.length, 5);
  assert.equal(result.instance.stageRuntimes.length, 5);
  assert.equal(result.insertIndex, 2);
  assert.equal(result.instance.currentStageIndex, 2);
  assert.equal(result.instance.stageRuntimes[2]!.status, 'pending');
  assert.equal(result.instance.stageRuntimes[2]!.stageId, result.insertedStageId);
});

test('POC: applyRuntimeReplan is idempotent on same stage id', () => {
  const instance = pythonSliceInstance();
  const plan = planDeterministicReplan({
    trigger: {
      kind: 'preflight-pytest-asyncio',
      testRunStageId: 'stage_test_run_market_connector',
      sliceSemantic: 'market_connector',
    },
    instance,
  });
  assert.ok(plan);
  const first = applyRuntimeReplan(instance, plan!);
  assert.equal(first.ok, true);
  if (!first.ok) {
    return;
  }
  const second = applyRuntimeReplan(first.instance, plan!);
  assert.equal(second.ok, false);
  if (second.ok) {
    return;
  }
  assert.equal(second.reason, 'already-inserted');
});

test('POC: replan budget denies after max per slice', () => {
  const ledger = nextLedgerAfterInsert(
    nextLedgerAfterInsert(emptyReplanLedger(), 'market_connector', 'a', 'preflight-pytest-asyncio'),
    'market_connector',
    'b',
    'preflight-pytest-asyncio',
  );
  assert.equal(canSpendReplanBudget({ ledger, sliceSemantic: 'market_connector' }), false);
});

test('POC: shouldOfferRuntimeReplan reads ledger from test_run runtime outputs', () => {
  const instance = pythonSliceInstance();
  const testRt = instance.stageRuntimes.find((rt) => rt.stageId === 'stage_test_run_market_connector')!;
  testRt.outputs._runtimeReplan = nextLedgerAfterInsert(
    nextLedgerAfterInsert(emptyReplanLedger(), 'market_connector', 'x', 'preflight-pytest-asyncio'),
    'market_connector',
    'y',
    'preflight-pytest-asyncio',
  );
  assert.equal(
    shouldOfferRuntimeReplan({
      trigger: {
        kind: 'preflight-pytest-asyncio',
        testRunStageId: 'stage_test_run_market_connector',
        sliceSemantic: 'market_connector',
      },
      instance,
    }),
    false,
  );
});

test('POC: gate-repair-exhausted plans llm replan stage before test_run', () => {
  const instance = pythonSliceInstance();
  const action = planDeterministicReplan({
    trigger: {
      kind: 'gate-repair-exhausted',
      testRunStageId: 'stage_test_run_market_connector',
      sliceSemantic: 'market_connector',
      gateId: GATE_ID_PYTHON_EXPORT_CONTRACT,
      message: 'missing MarketGateway',
    },
    instance,
    gateRepairWriteTarget: 'market_connector.py',
  });
  assert.ok(action);
  assert.equal(action!.anchorStageId, 'stage_impl_market_connector');
  assert.match(action!.stage.id, new RegExp(`^${RUNTIME_REPLAN_STAGE_ID_PREFIX}gate_`));
  const tc = action!.stage.toolConfig;
  assert.equal(tc.type, 'llm-text');
  if (tc.type === 'llm-text') {
    assert.equal(tc.writeOutputToFile, 'market_connector.py');
  }
});

