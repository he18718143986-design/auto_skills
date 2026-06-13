import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerBuiltinQualityGates } from '../BuiltinQualityGates';
import { getDefaultQualityGateRegistry, resetDefaultQualityGateRegistry } from '../QualityGate';
import type { QualityGateExecutionHost } from '../QualityGate';
import type { Stage, WorkflowDefinition, WorkflowInstance } from '../WorkflowDefinition';
import type { ExecuteNextStageLoopParams } from '../WorkflowExecutorTypes';
import { runPreGateRegistry } from '../PreGateRegistry';
import { evaluateSkipCondition } from '../WorkflowSkipCondition';

function meta() {
  return {
    title: 't',
    taskType: 'software',
    userInput: 'input',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function minimalParams(
  instance: WorkflowInstance,
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
    primaryOutputKey: (s) => s.outputs[0]?.key ?? 'out',
    ensureTaskDir: () => '/tmp/task',
    resolveInput: async () => '',
    executeLlmText: async () => '',
    applyPatchInstructions: async () => {},
    resolveTaskFilePath: () => '/tmp/f',
    resolveOutputPath: () => '/tmp/out',
    runCodeRunner: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    isCancellationError: () => false,
    posted,
    ...extras,
  };
}

function implWithPairedTestRun(): { instance: WorkflowInstance; implStage: Stage } {
  const impl: Stage = {
    id: 'stage_impl_reader',
    title: 'impl reader',
    tool: 'llm-text',
    toolConfig: { type: 'llm-text', systemPrompt: 'x'.repeat(40) },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'out', format: 'text' }],
    pauseAfter: false,
  };
  const testRun: Stage = {
    id: 'stage_test_run_reader',
    title: 'test reader',
    tool: 'code-runner',
    toolConfig: { type: 'code-runner', command: 'npm test', captureOutput: true },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'text', format: 'text' }],
    pauseAfter: false,
  };
  const wf: WorkflowDefinition = {
    id: 'wf-1',
    version: '2.0',
    meta: meta(),
    stages: [impl, testRun],
  };
  const instance: WorkflowInstance = {
    definition: wf,
    stageRuntimes: [
      { stageId: impl.id, status: 'pending', outputs: {}, retryCount: 0 },
      { stageId: testRun.id, status: 'pending', outputs: {}, retryCount: 0 },
    ],
    status: 'running',
    currentStageIndex: 0,
  };
  return { instance, implStage: impl };
}

test('runPreGateRegistry continues when qualityGateExecutionHost is absent', async () => {
  const { instance, implStage } = implWithPairedTestRun();
  const params = minimalParams(instance);
  const outcome = await runPreGateRegistry(params, implStage, 0, 'before-impl', 0);
  assert.equal(outcome, 'continue');
});

test('runPreGateRegistry blocks on synthetic pre-stage gate', async () => {
  resetDefaultQualityGateRegistry();
  const registry = getDefaultQualityGateRegistry();
  registry.registerOrReplace({
    id: 'test-pre-block',
    label: 'test',
    phase: 'pre-stage',
    when: 'always',
    priority: 1,
    evaluate: () => ({ gateId: 'test-pre-block', severity: 'block', messages: ['blocked-by-test'] }),
  });
  const { instance, implStage } = implWithPairedTestRun();
  const host: QualityGateExecutionHost = {
    getWorkspaceRootAbsolute: () => '/tmp',
    resolveCodeRunnerCwd: () => '/tmp',
    runCodeRunner: async () => ({ exitCode: 1, stdout: '', stderr: '' }),
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
  const params = minimalParams(instance, { qualityGateExecutionHost: host });
  const outcome = await runPreGateRegistry(params, implStage, 0, 'always', 0);
  assert.equal(outcome, 'failed');
  assert.ok(params.posted.some((m) => (m as { type?: string }).type === 'stageError'));
});

test('runPreGateRegistry emits red-green warn streamChunk before impl', async () => {
  resetDefaultQualityGateRegistry();
  registerBuiltinQualityGates();
  const { instance, implStage } = implWithPairedTestRun();
  const host: QualityGateExecutionHost = {
    getWorkspaceRootAbsolute: () => '/tmp',
    resolveCodeRunnerCwd: () => '/tmp',
    runCodeRunner: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    runWorkspaceContractLint: async () => [],
    runSdkPathContractHardGate: async () => null,
    runPythonExportContractHardGate: async () => null,
    runPythonPypiSymbolHardGate: async () => null,
    runPostImplStaticAnalysis: async () => [],
    readRedGreenGateMode: () => 'warn',
    readDebugFeedbackLoopRuntimeHard: () => false,
    readTestRunPreflightEnabled: () => false,
    readTestRunAutoNpmInstallEnabled: () => false,
    readSdkPathContractLintMode: () => 'off',
    readPythonExportContractLintMode: () => 'off',
    readPythonPypiSymbolLintMode: () => 'off',
    readStaticAnalysisEnabled: () => false,
  };
  const params = minimalParams(instance, { qualityGateExecutionHost: host });
  const outcome = await runPreGateRegistry(params, implStage, 0, 'before-impl', 0);
  assert.equal(outcome, 'continue');
  const chunk = params.posted.find((m) => (m as { type?: string }).type === 'streamChunk') as
    | { chunk?: string }
    | undefined;
  assert.ok(chunk?.chunk?.includes('红绿门'), chunk?.chunk ?? 'no streamChunk');
});

test('builtin quality gates: dependsOn is consistent with priority/phase/when', () => {
  resetDefaultQualityGateRegistry();
  registerBuiltinQualityGates();
  const issues = getDefaultQualityGateRegistry().validateDependencies();
  assert.deepEqual(
    issues,
    [],
    `gate dependency inconsistencies: ${issues.map((i) => i.message).join(' | ')}`,
  );
});

test('validateDependencies flags priority-order contradiction', () => {
  resetDefaultQualityGateRegistry();
  const reg = getDefaultQualityGateRegistry();
  reg.register({ id: 'a', label: 'A', phase: 'pre-stage', priority: 50, evaluate: () => null });
  reg.register({
    id: 'b',
    label: 'B',
    phase: 'pre-stage',
    priority: 40,
    dependsOn: ['a'],
    evaluate: () => null,
  });
  const issues = reg.validateDependencies();
  assert.equal(issues.length, 1);
  assert.equal(issues[0].kind, 'priority-order');
  resetDefaultQualityGateRegistry();
});
