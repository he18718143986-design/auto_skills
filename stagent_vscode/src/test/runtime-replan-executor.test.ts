import './install-vscode-stub';
import { test, mock } from 'node:test';
import * as assert from 'node:assert/strict';
import { registerBuiltinQualityGates } from '../BuiltinQualityGates';
import { getDefaultQualityGateRegistry, resetDefaultQualityGateRegistry } from '../QualityGate';
import type { QualityGateExecutionHost } from '../QualityGate';
import { GATE_ID_PYTHON_EXPORT_CONTRACT, GATE_ID_TEST_RUN_PREFLIGHT } from '../QualityGateIds';
import type { Stage, WorkflowInstance } from '../WorkflowDefinition';
import type { ExecuteNextStageLoopParams } from '../WorkflowExecutorTypes';
import { evaluateSkipCondition } from '../WorkflowSkipCondition';
import * as gateRepairModule from '../gate-repair/runGateAutoRepair';

function meta() {
  return {
    title: 't',
    taskType: 'software' as const,
    userInput: 'u',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function pythonSliceWithVenvInstance(): { instance: WorkflowInstance; testRun: Stage; testIdx: number } {
  const venvCreate: Stage = {
    id: 'stage_venv_create',
    title: 'venv',
    tool: 'code-runner',
    toolConfig: { type: 'code-runner', command: 'python3 -m venv .venv', captureOutput: true },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'out', format: 'text' }],
    pauseAfter: false,
  };
  const pipInstall: Stage = {
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
  };
  const impl: Stage = {
    id: 'stage_impl_market_connector',
    title: 'impl',
    tool: 'llm-text',
    toolConfig: {
      type: 'llm-text',
      systemPrompt: 'x',
      writeOutputToFile: 'market_connector.py',
    },
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
  const stages = [venvCreate, pipInstall, impl, testRun];
  const instance: WorkflowInstance = {
    definition: { id: 'wf', version: '2.0', meta: meta(), stages },
    stageRuntimes: stages.map((s, i) => ({
      stageId: s.id,
      status: i === stages.length - 1 ? 'running' : 'done',
      outputs: {},
      retryCount: 0,
    })),
    currentStageIndex: stages.length - 1,
    status: 'running',
  };
  return { instance, testRun, testIdx: stages.length - 1 };
}

function exportContractBlockInstance(): { instance: WorkflowInstance; testRun: Stage; testIdx: number } {
  const impl: Stage = {
    id: 'stage_impl_market_connector',
    title: 'impl',
    tool: 'llm-text',
    toolConfig: {
      type: 'llm-text',
      systemPrompt: 'x',
      writeOutputToFile: 'market_connector.py',
    },
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
  const stages = [impl, testRun];
  const instance: WorkflowInstance = {
    definition: { id: 'wf', version: '2.0', meta: meta(), stages },
    stageRuntimes: stages.map((s, i) => ({
      stageId: s.id,
      status: i === 0 ? 'done' : 'running',
      outputs: {},
      retryCount: 0,
    })),
    currentStageIndex: 1,
    status: 'running',
  };
  return { instance, testRun, testIdx: 1 };
}

function minimalParams(
  instance: WorkflowInstance,
  host: QualityGateExecutionHost,
  extras: Partial<ExecuteNextStageLoopParams> = {},
): ExecuteNextStageLoopParams & { posted: unknown[] } {
  const posted: unknown[] = [];
  return {
    instance,
    panel: {},
    currentInstanceKey: 'key-1',
    setCurrentInstanceKey: () => {},
    evaluateSkipCondition,
    postMessage: (_p, msg) => {
      posted.push(msg);
    },
    scheduleSave: () => {},
    debugLog: () => {},
    logUserAction: () => {},
    primaryOutputKey: (s) => s.outputs[0]?.key ?? 'out',
    ensureTaskDir: () => '/tmp/task',
    resolveInput: async () => '',
    executeLlmText: async () => 'class MarketGateway: pass\n',
    applyPatchInstructions: async () => {},
    resolveTaskFilePath: () => '/tmp/f',
    resolveOutputPath: (_k, rel) => `/tmp/workspace/${rel}`,
    runCodeRunner: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    isCancellationError: () => false,
    qualityGateExecutionHost: host,
    posted,
    ...extras,
  };
}

test('P3b: tryRuntimeReplanFromGateBlock inserts gate replan stage and defers test_run', async () => {
  const { tryRuntimeReplanFromGateBlock } = await import('../runtime-replan/tryRuntimeReplanFromGate');
  const { instance, testRun } = exportContractBlockInstance();
  const params = minimalParams(instance, {
    getWorkspaceRootAbsolute: () => '/tmp',
    resolveCodeRunnerCwd: () => '/tmp',
    runCodeRunner: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    runWorkspaceContractLint: async () => [],
    runSdkPathContractHardGate: async () => null,
    runPythonExportContractHardGate: async () => null,
    runPythonPypiSymbolHardGate: async () => null,
    runPostImplStaticAnalysis: async () => [],
    readRedGreenGateMode: () => 'off',
    readDebugFeedbackLoopRuntimeHard: () => false,
    readTestRunPreflightEnabled: () => false,
    readTestRunAutoNpmInstallEnabled: () => false,
    readSdkPathContractLintMode: () => 'off',
    readPythonExportContractLintMode: () => 'off',
    readPythonPypiSymbolLintMode: () => 'off',
    readStaticAnalysisEnabled: () => false,
  });

  const outcome = tryRuntimeReplanFromGateBlock({
    loopParams: params,
    testRunStage: testRun,
    block: {
      gateId: GATE_ID_PYTHON_EXPORT_CONTRACT,
      severity: 'block',
      messages: ['missing MarketGateway'],
      meta: {
        issue: {
          code: 'python-test-import-symbol-missing',
          message: 'missing',
          module: 'market_connector',
          symbol: 'MarketGateway',
          testFile: 'tests/test_market_connector.py',
          implFile: 'market_connector.py',
        },
      },
    },
    attempt: 0,
  });

  assert.equal(outcome, 'replan');
  assert.equal(params.instance.definition.stages.length, 3);
  assert.match(params.instance.definition.stages[1]!.id, /^stage_runtime_replan_gate_/);
  assert.equal(params.instance.currentStageIndex, 1);
  const testRt = params.instance.stageRuntimes.find((rt) => rt.stageId === testRun.id);
  assert.equal(testRt?.status, 'pending');
});

test('P3b: runPreGateRegistry returns replan when gate blocks and gate-repair skipped', async () => {
  const repairRestore = mock.method(gateRepairModule, 'tryGateAutoRepair', async () => false);
  const { runPreGateRegistry } = await import('../PreGateRegistry');

  resetDefaultQualityGateRegistry();
  registerBuiltinQualityGates();
  const registry = getDefaultQualityGateRegistry();
  const exportIssue = {
    code: 'python-test-import-symbol-missing' as const,
    message: 'missing MarketGateway',
    module: 'market_connector',
    symbol: 'MarketGateway',
    testFile: 'tests/test_market_connector.py',
    implFile: 'market_connector.py',
  };
  registry.registerOrReplace({
    id: GATE_ID_PYTHON_EXPORT_CONTRACT,
    label: 'test-export-block',
    phase: 'pre-stage',
    when: 'before-test-run',
    priority: 1,
    evaluate: () => ({
      gateId: GATE_ID_PYTHON_EXPORT_CONTRACT,
      severity: 'block',
      messages: ['python-export-contract：missing MarketGateway'],
      meta: { issue: exportIssue },
    }),
  });

  try {
    const { instance, testRun, testIdx } = exportContractBlockInstance();
    const host: QualityGateExecutionHost = {
      getWorkspaceRootAbsolute: () => '/tmp',
      resolveCodeRunnerCwd: () => '/tmp',
      runCodeRunner: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
      runWorkspaceContractLint: async () => [],
      runSdkPathContractHardGate: async () => null,
      runPythonExportContractHardGate: async () => null,
      runPythonPypiSymbolHardGate: async () => null,
      runPostImplStaticAnalysis: async () => [],
      readRedGreenGateMode: () => 'off',
      readDebugFeedbackLoopRuntimeHard: () => false,
      readTestRunPreflightEnabled: () => false,
      readTestRunAutoNpmInstallEnabled: () => false,
      readSdkPathContractLintMode: () => 'off',
      readPythonExportContractLintMode: () => 'off',
      readPythonPypiSymbolLintMode: () => 'off',
      readStaticAnalysisEnabled: () => false,
    };
    const params = minimalParams(instance, host);
    const outcome = await runPreGateRegistry(params, testRun, testIdx, 'before-test-run', 0);
    assert.equal(outcome, 'replan');
    assert.equal(params.instance.definition.stages.length, 3);
  } finally {
    repairRestore.mock.restore();
    resetDefaultQualityGateRegistry();
    registerBuiltinQualityGates();
  }
});

test('P3c: runPreGateRegistry returns replan when preflight blocks on missing pytest-asyncio', async () => {
  const { runPreGateRegistry } = await import('../PreGateRegistry');

  resetDefaultQualityGateRegistry();
  registerBuiltinQualityGates();
  const registry = getDefaultQualityGateRegistry();
  const preflightIssue = {
    code: 'missing-pytest-asyncio' as const,
    message: 'python-test-run-preflight：tests 使用 @pytest.mark.asyncio 但 venv 未安装 pytest-asyncio。',
    hint: 'pip install "pytest-asyncio>=0.23.0"',
  };
  registry.registerOrReplace({
    id: GATE_ID_TEST_RUN_PREFLIGHT,
    label: 'test-preflight-block',
    phase: 'pre-stage',
    when: 'before-test-run',
    priority: 1,
    evaluate: () => ({
      gateId: GATE_ID_TEST_RUN_PREFLIGHT,
      severity: 'block',
      messages: [preflightIssue.message],
      meta: { issue: preflightIssue },
    }),
  });

  try {
    const { instance, testRun, testIdx } = pythonSliceWithVenvInstance();
    const host: QualityGateExecutionHost = {
      getWorkspaceRootAbsolute: () => '/tmp',
      resolveCodeRunnerCwd: () => '/tmp',
      runCodeRunner: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
      runWorkspaceContractLint: async () => [],
      runSdkPathContractHardGate: async () => null,
      runPythonExportContractHardGate: async () => null,
      runPythonPypiSymbolHardGate: async () => null,
      runPostImplStaticAnalysis: async () => [],
      readRedGreenGateMode: () => 'off',
      readDebugFeedbackLoopRuntimeHard: () => false,
      readTestRunPreflightEnabled: () => true,
      readTestRunAutoNpmInstallEnabled: () => false,
      readSdkPathContractLintMode: () => 'off',
      readPythonExportContractLintMode: () => 'off',
      readPythonPypiSymbolLintMode: () => 'off',
      readStaticAnalysisEnabled: () => false,
    };
    const params = minimalParams(instance, host);
    const outcome = await runPreGateRegistry(params, testRun, testIdx, 'before-test-run', 0);
    assert.equal(outcome, 'replan');
    assert.equal(params.instance.definition.stages.length, 5);
    assert.match(params.instance.definition.stages[2]!.id, /^stage_runtime_replan_pip_pytest_asyncio_/);
    assert.equal(params.instance.currentStageIndex, 2);
    const testRt = params.instance.stageRuntimes.find((rt) => rt.stageId === testRun.id);
    assert.equal(testRt?.status, 'pending');
  } finally {
    resetDefaultQualityGateRegistry();
    registerBuiltinQualityGates();
  }
});

test('P3c: tryRuntimeReplanFromPreflightBlock inserts pip stage after venv_pip', async () => {
  const { tryRuntimeReplanFromPreflightBlock } = await import('../runtime-replan/tryRuntimeReplanFromGate');
  const { instance, testRun } = pythonSliceWithVenvInstance();
  const params = minimalParams(instance, {
    getWorkspaceRootAbsolute: () => '/tmp',
    resolveCodeRunnerCwd: () => '/tmp',
    runCodeRunner: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    runWorkspaceContractLint: async () => [],
    runSdkPathContractHardGate: async () => null,
    runPythonExportContractHardGate: async () => null,
    runPythonPypiSymbolHardGate: async () => null,
    runPostImplStaticAnalysis: async () => [],
    readRedGreenGateMode: () => 'off',
    readDebugFeedbackLoopRuntimeHard: () => false,
    readTestRunPreflightEnabled: () => true,
    readTestRunAutoNpmInstallEnabled: () => false,
    readSdkPathContractLintMode: () => 'off',
    readPythonExportContractLintMode: () => 'off',
    readPythonPypiSymbolLintMode: () => 'off',
    readStaticAnalysisEnabled: () => false,
  });

  const outcome = tryRuntimeReplanFromPreflightBlock({
    loopParams: params,
    testRunStage: testRun,
    block: {
      gateId: GATE_ID_TEST_RUN_PREFLIGHT,
      severity: 'block',
      messages: ['missing pytest-asyncio'],
      meta: {
        issue: {
          code: 'missing-pytest-asyncio',
          message: 'missing pytest-asyncio',
          hint: 'pip install',
        },
      },
    },
    attempt: 0,
  });

  assert.equal(outcome, 'replan');
  assert.equal(params.instance.definition.stages.length, 5);
  assert.match(params.instance.definition.stages[2]!.id, /^stage_runtime_replan_pip_pytest_asyncio_/);
  assert.equal(params.instance.currentStageIndex, 2);
});
