import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { lintPlanCompleteness } from '../plan-completeness/lintPlanCompleteness';
import { lintTemplateStageCap, resolveWorkflowStageCap } from '../path-router/templateStageCap';
import type { WorkflowDefinition } from '../WorkflowDefinition';

function wf(stages: number, meta: WorkflowDefinition['meta']): WorkflowDefinition {
  return {
    id: 'wf',
    version: '2.0',
    meta,
    stages: Array.from({ length: stages }, (_, i) => ({
      id: `stage_${i}`,
      title: `S${i}`,
      tool: 'llm-text',
      toolConfig: { type: 'llm-text', systemPrompt: 'x' },
      input: { sources: [], mergeStrategy: 'concat' },
      outputs: [{ key: 'main', format: 'text' }],
      pauseAfter: false,
    })),
  };
}

test('resolveWorkflowStageCap returns 6 for prototype', () => {
  assert.equal(resolveWorkflowStageCap(wf(1, { title: 't', taskType: 'prototype', userInput: 'u', createdAt: '' })), 6);
});

test('resolveWorkflowStageCap returns 8 for express template', () => {
  assert.equal(
    resolveWorkflowStageCap(
      wf(1, { title: 't', taskType: 'software', userInput: 'u', createdAt: '', workflowTemplate: 'express' }),
    ),
    8,
  );
});

test('lintTemplateStageCap flags prototype over 6 stages', () => {
  assert.ok(lintTemplateStageCap(wf(10, { title: 't', taskType: 'prototype', userInput: 'u', createdAt: '' }))?.includes('>6'));
});

test('lintPlanCompleteness blocks express workflow over 8 stages', () => {
  const issues = lintPlanCompleteness(
    wf(12, {
      title: 't',
      taskType: 'software',
      userInput: 'u',
      createdAt: '',
      workflowTemplate: 'express',
    }),
  );
  assert.ok(issues.some((i) => i.type === 'template-stage-cap-exceeded'));
});

test('lintPlanCompleteness skips missing-main-assembly on express path', () => {
  const stages = [
    ...Array.from({ length: 4 }, (_, i) => ({
      id: `stage_impl_m${i}`,
      title: `impl ${i}`,
      tool: 'llm-text' as const,
      toolConfig: { type: 'llm-text' as const, systemPrompt: 'x', writeOutputToFile: `m${i}.py` },
      input: { sources: [], mergeStrategy: 'concat' as const },
      outputs: [{ key: 'main', format: 'text' as const }],
      pauseAfter: false,
    })),
    {
      id: 'stage_test_run_x',
      title: 'run',
      tool: 'code-runner' as const,
      toolConfig: { type: 'code-runner' as const, command: 'pytest', captureOutput: true },
      input: { sources: [], mergeStrategy: 'concat' as const },
      outputs: [{ key: 'log', format: 'text' as const }],
      pauseAfter: false,
    },
  ];
  const issues = lintPlanCompleteness({
    id: 'wf',
    version: '2.0',
    meta: { title: 't', taskType: 'prototype', userInput: 'u', createdAt: '', workflowTemplate: 'express' },
    stages,
  });
  assert.equal(issues.some((i) => i.type === 'missing-main-assembly'), false);
});
