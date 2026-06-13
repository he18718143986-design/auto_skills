import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { injectImplSliceScopePrompts } from '../impl-scope/injectImplSliceScope';
import type { WorkflowDefinition } from '../WorkflowDefinition';

test('injectImplSliceScopePrompts adds scope block to impl stages', () => {
  const wf: WorkflowDefinition = {
    id: 'wf',
    version: '2.0',
    meta: { title: 't', taskType: 'prototype', userInput: 'u', createdAt: '' },
    stages: [
      {
        id: 'stage_test_write_core',
        title: 'write',
        tool: 'llm-text',
        toolConfig: { type: 'llm-text', systemPrompt: 'write test' },
        input: { sources: [], mergeStrategy: 'concat' },
        outputs: [{ key: 'main', format: 'text' }],
        pauseAfter: false,
      },
      {
        id: 'stage_impl_core',
        title: 'impl core',
        tool: 'llm-text',
        toolConfig: { type: 'llm-text', systemPrompt: 'implement core only' },
        input: { sources: [], mergeStrategy: 'concat' },
        outputs: [{ key: 'main', format: 'text' }],
        pauseAfter: false,
      },
      {
        id: 'stage_impl_priority',
        title: 'impl priority',
        tool: 'llm-text',
        toolConfig: { type: 'llm-text', systemPrompt: 'implement priority' },
        input: { sources: [], mergeStrategy: 'concat' },
        outputs: [{ key: 'main', format: 'text' }],
        pauseAfter: false,
      },
    ],
  };
  injectImplSliceScopePrompts(wf);
  const corePrompt = (wf.stages[1]!.toolConfig as { systemPrompt: string }).systemPrompt;
  const priPrompt = (wf.stages[2]!.toolConfig as { systemPrompt: string }).systemPrompt;
  assert.ok(corePrompt.includes('本切片范围'));
  assert.ok(corePrompt.includes('priority'));
  assert.ok(priPrompt.includes('core'));
  injectImplSliceScopePrompts(wf);
  assert.equal((corePrompt.match(/本切片范围/g) ?? []).length, 1);
});
