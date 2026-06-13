import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import type { Stage, WorkflowDefinition } from '../WorkflowDefinition';
import {
  detectPythonInfraPlanIssues,
  detectSelfHealInfraGaps,
  firstPythonInfraAnchorIndex,
  pythonVenvChainComplete,
  pythonVenvChainStatusBefore,
} from '../contract-infra';
import { lintPythonTestInfraInPlan } from '../plan-completeness/pythonTestInfraChecks';
import { injectSelfHealStages, auditSelfHealGaps } from '../workflow-self-heal/injectSelfHealStages';
import { buildNodeExtensionScriptCommand } from '../contract-infra';

function codeRunner(id: string, command: string): Stage {
  return {
    id,
    title: id,
    tool: 'code-runner',
    toolConfig: { type: 'code-runner', command, captureOutput: true },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'verifyOut', format: 'text' }],
    pauseAfter: false,
  };
}

function llmImpl(id: string, file: string): Stage {
  return {
    id,
    title: id,
    tool: 'llm-text',
    toolConfig: { type: 'llm-text', systemPrompt: 'x', writeOutputToFile: file },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'out', format: 'text' }],
    pauseAfter: false,
  };
}

const baseMeta = {
  title: 't',
  taskType: 'prototype' as const,
  userInput: 'u',
  createdAt: new Date().toISOString(),
};

test('firstPythonInfraAnchorIndex matches any test_run for python-only', () => {
  const wf: WorkflowDefinition = {
    id: 'wf',
    version: '2.0',
    meta: baseMeta,
    stages: [
      llmImpl('stage_impl_calc', 'calculator.py'),
      codeRunner('stage_test_run_calc', 'python calculator.py'),
    ],
  };
  assert.equal(firstPythonInfraAnchorIndex(wf), 1);
});

test('lint and detector agree on missing venv chain', () => {
  const wf: WorkflowDefinition = {
    id: 'wf',
    version: '2.0',
    meta: baseMeta,
    stages: [
      llmImpl('stage_impl_calc', 'calculator.py'),
      llmImpl('stage_test_write_calc', 'tests/test_calc.py'),
      codeRunner('stage_test_run_calc', 'pytest -q'),
    ],
  };
  const detectorIssues = detectPythonInfraPlanIssues(wf);
  const lintIssues = lintPythonTestInfraInPlan(wf);
  assert.ok(detectorIssues.some((i) => i.kind === 'missing-python-venv-chain'));
  assert.ok(lintIssues.some((i) => i.type === 'missing-python-venv-chain'));
});

test('injectSelfHealStages and auditSelfHealGaps agree after injection', () => {
  const wf: WorkflowDefinition = {
    id: 'wf',
    version: '2.0',
    meta: baseMeta,
    stages: [
      llmImpl('stage_impl_calc', 'calculator.py'),
      llmImpl('stage_test_write_calc', 'tests/test_calc.py'),
      codeRunner('stage_test_run_calc', 'pytest -q'),
    ],
  };
  const { workflow } = injectSelfHealStages(wf);
  const status = pythonVenvChainStatusBefore(workflow.stages ?? [], firstPythonInfraAnchorIndex(workflow)!);
  assert.equal(pythonVenvChainComplete(status), true);
  assert.equal(auditSelfHealGaps(workflow).some((g) => g.includes('venv')), false);
  assert.equal(detectSelfHealInfraGaps(workflow).some((g) => g.includes('venv')), false);
});

test('buildNodeExtensionScriptCommand uses absolute script path', () => {
  const cmd = buildNodeExtensionScriptCommand('verify-python-test-imports.mjs', ['tests/test_x.py']);
  assert.match(cmd, /verify-python-test-imports\.mjs/);
  assert.doesNotMatch(cmd, /^node scripts\//);
});
