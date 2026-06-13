import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import type { Stage, WorkflowDefinition } from '../WorkflowDefinition';
import { injectPythonVenvChainBeforeTestRun, injectSelfHealStages } from '../workflow-self-heal/injectSelfHealStages';

function llmImpl(id: string, file?: string): Stage {
  return {
    id,
    title: id,
    tool: 'llm-text',
    toolConfig: {
      type: 'llm-text',
      systemPrompt: 'x',
      ...(file ? { writeOutputToFile: file } : {}),
    },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'main', format: 'text' }],
    pauseAfter: false,
  };
}

function pytestRun(id: string): Stage {
  return {
    id,
    title: id,
    tool: 'code-runner',
    toolConfig: { type: 'code-runner', command: 'pytest -q', captureOutput: true },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'verifyOut', format: 'text' }],
    pauseAfter: false,
  };
}

test('injectPythonVenvChainBeforeTestRun inserts create pip import in order', () => {
  const stages = [
    llmImpl('stage_impl_calculator', 'calculator.py'),
    llmImpl('stage_test_write_calculator', 'test_calculator.py'),
  ];
  const result = injectPythonVenvChainBeforeTestRun(stages, 2);
  const ids = result.stages.map((s) => s.id);
  assert.ok(result.insertedStageIds.includes('stage_venv_create'));
  assert.ok(result.insertedStageIds.includes('stage_venv_pip_install'));
  assert.ok(result.insertedStageIds.includes('stage_venv_import_check'));
  assert.ok(ids.indexOf('stage_venv_create') < ids.indexOf('stage_venv_pip_install'));
  assert.ok(ids.indexOf('stage_venv_pip_install') < ids.indexOf('stage_venv_import_check'));
  const pip = result.stages.find((s) => s.id === 'stage_venv_pip_install')!;
  assert.match((pip.toolConfig as { command: string }).command, /pytest/);
});

test('injectSelfHealStages python prototype no longer inserts orphan venv_import_check', () => {
  const wf: WorkflowDefinition = {
    id: 'wf',
    version: '2.0',
    meta: { title: 'calc', taskType: 'prototype', userInput: 'pytest calculator', createdAt: '' },
    stages: [
      llmImpl('stage_impl_calculator', 'calculator.py'),
      llmImpl('stage_test_write_calculator', 'test_calculator.py'),
      pytestRun('stage_test_run_calculator'),
    ],
  };
  const { workflow, insertedStageIds } = injectSelfHealStages(wf);
  const ids = workflow.stages.map((s) => s.id);
  if (insertedStageIds.includes('stage_venv_import_check')) {
    assert.ok(ids.includes('stage_venv_create'));
    assert.ok(ids.indexOf('stage_venv_create') < ids.indexOf('stage_venv_import_check'));
  }
});
