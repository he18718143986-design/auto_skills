import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { applyPrototypeDiskPipeline } from '../disk-bootstrap/applyPrototypePipeline';
import { lintPlanCompleteness } from '../plan-completeness/lintPlanCompleteness';
import { auditSelfHealGaps } from '../workflow-self-heal/injectSelfHealStages';
import type { WorkflowDefinition } from '../WorkflowDefinition';

test('validateAndPrepareGeneratedWorkflow injects self-heal for prototype TDD chain', () => {
  const wf: WorkflowDefinition = {
    id: 'wf_proto',
    version: '2.0',
    meta: { title: 'p', taskType: 'prototype', userInput: 'python tdd', createdAt: '' },
    stages: [
      {
        id: 'stage_impl_greet',
        title: 'impl',
        tool: 'llm-text',
        toolConfig: { type: 'llm-text', systemPrompt: 'x', writeOutputToFile: 'greet.py' },
        input: { sources: [], mergeStrategy: 'concat' },
        outputs: [{ key: 'main', format: 'text' }],
        pauseAfter: false,
      },
      {
        id: 'stage_test_write_greet',
        title: 'write',
        tool: 'llm-text',
        toolConfig: { type: 'llm-text', systemPrompt: 'x', writeOutputToFile: 'test_greet.py' },
        input: { sources: [], mergeStrategy: 'concat' },
        outputs: [{ key: 'main', format: 'text' }],
        pauseAfter: false,
      },
      {
        id: 'stage_test_run_greet',
        title: 'run',
        tool: 'code-runner',
        toolConfig: { type: 'code-runner', command: 'pytest -q', captureOutput: true },
        input: { sources: [], mergeStrategy: 'concat' },
        outputs: [{ key: 'log', format: 'text' }],
        pauseAfter: false,
      },
    ],
  };
  const prepared = applyPrototypeDiskPipeline(wf);
  assert.equal(auditSelfHealGaps(prepared).length, 0);
  assert.equal(lintPlanCompleteness(prepared).some((i) => i.type === 'missing-self-heal-chain'), false);
});
