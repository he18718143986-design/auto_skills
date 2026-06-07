import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import type { Stage, WorkflowDefinition } from '../WorkflowDefinition';
import {
  commandBundlesInstallAndTest,
  deriveDepsInstallStageId,
  splitBundledInstallAndTestCommand,
  splitBundledTestRunCommands,
} from '../TestRunCommandNormalize';
import { resolveCodeRunnerTimeoutSeconds } from '../CodeRunnerInvokeHelpers';
import { normalizeWorkflow } from '../WorkflowGeneration';

test('splitBundledInstallAndTestCommand: npm install && npx jest', () => {
  const split = splitBundledInstallAndTestCommand('npm install --silent && npx jest --testPathPattern=auth');
  assert.deepEqual(split, {
    install: 'npm install --silent',
    test: 'npx jest --testPathPattern=auth',
  });
});

test('splitBundledInstallAndTestCommand: cd prefix copied to both sides', () => {
  const split = splitBundledInstallAndTestCommand('cd mobile && npm install && npx jest');
  assert.equal(split?.install, 'cd mobile && npm install');
  assert.equal(split?.test, 'cd mobile && npx jest');
});

test('splitBundledInstallAndTestCommand: npm ci && npm test', () => {
  assert.ok(commandBundlesInstallAndTest('npm ci && npm test'));
  const split = splitBundledInstallAndTestCommand('npm ci && npm test');
  assert.equal(split?.install, 'npm ci');
  assert.equal(split?.test, 'npm test');
});

test('splitBundledInstallAndTestCommand: plain jest only returns null', () => {
  assert.equal(splitBundledInstallAndTestCommand('npx jest'), null);
  assert.equal(commandBundlesInstallAndTest('npm test'), false);
});

test('deriveDepsInstallStageId from test_run id', () => {
  assert.equal(deriveDepsInstallStageId('stage_test_run_auth'), 'stage_deps_install_auth');
});

function testRunStage(id: string, command: string): Stage {
  return {
    id,
    title: id,
    tool: 'code-runner',
    toolConfig: { type: 'code-runner', command, captureOutput: true },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'out', format: 'text' }],
    pauseAfter: false,
  };
}

test('splitBundledTestRunCommands inserts stage_deps_install_* before test_run', () => {
  const wf: WorkflowDefinition = {
    id: 'wf',
    version: '2.0',
    meta: { title: 't', taskType: 'software', userInput: 'x', createdAt: '2026-01-01T00:00:00.000Z' },
    stages: [
      testRunStage('stage_test_run_auth', 'npm install --silent && npx jest --testPathPattern=auth'),
    ],
  };
  assert.equal(splitBundledTestRunCommands(wf), 1);
  assert.equal(wf.stages.length, 2);
  assert.equal(wf.stages[0]!.id, 'stage_deps_install_auth');
  assert.equal((wf.stages[0]!.toolConfig as { command: string }).command, 'npm install --silent');
  assert.equal(
    (wf.stages[1]!.toolConfig as { command: string }).command,
    'npx jest --testPathPattern=auth',
  );
});

test('normalizeWorkflow applies M38.2 split and per-stage timeouts', () => {
  const wf: WorkflowDefinition = {
    id: 'wf',
    version: '2.0',
    meta: { title: 't', taskType: 'software', userInput: 'x', createdAt: '2026-01-01T00:00:00.000Z' },
    stages: [
      {
        id: 'stage_decide_architecture_overview',
        title: 'arch',
        tool: 'llm-text',
        toolConfig: { type: 'llm-text', systemPrompt: 'decide arch' },
        input: { sources: [{ type: 'user-input', label: 'x' }], mergeStrategy: 'concat' },
        outputs: [{ key: 'decisionRecord', format: 'markdown' }],
        isDecisionStage: true,
        pauseAfter: true,
      },
      testRunStage('stage_test_run_unit', 'npm install && npm test'),
    ],
  };
  const out = normalizeWorkflow(wf, 'x', 'software', { splitTestRunBundledCommands: true });
  const deps = out.stages.find((s) => s.id === 'stage_deps_install_unit');
  const testRun = out.stages.find((s) => s.id === 'stage_test_run_unit');
  assert.ok(deps);
  assert.equal((deps!.toolConfig as { command: string }).command, 'npm install');
  assert.equal((testRun!.toolConfig as { command: string }).command, 'npm test');
  assert.equal(resolveCodeRunnerTimeoutSeconds((deps!.toolConfig as { command: string }).command), 300);
  assert.equal(resolveCodeRunnerTimeoutSeconds((testRun!.toolConfig as { command: string }).command), 60);
});

test('normalizeWorkflow splitTestRunBundledCommands:false leaves bundled command', () => {
  const wf: WorkflowDefinition = {
    id: 'wf',
    version: '2.0',
    meta: { title: 't', taskType: 'prototype', userInput: 'x', createdAt: '2026-01-01T00:00:00.000Z' },
    stages: [
      {
        id: 'stage_decide',
        title: 'd',
        tool: 'llm-text',
        toolConfig: { type: 'llm-text', systemPrompt: 'd' },
        input: { sources: [{ type: 'user-input', label: 'x' }], mergeStrategy: 'concat' },
        outputs: [{ key: 'decisionRecord', format: 'markdown' }],
        isDecisionStage: true,
        pauseAfter: true,
      },
      testRunStage('stage_test_run_a', 'npm install && npx jest'),
    ],
  };
  const out = normalizeWorkflow(wf, 'x', 'prototype', { splitTestRunBundledCommands: false });
  assert.equal(out.stages.length, 2);
  assert.equal(
    (out.stages[1]!.toolConfig as { command: string }).command,
    'npm install && npx jest',
  );
});
