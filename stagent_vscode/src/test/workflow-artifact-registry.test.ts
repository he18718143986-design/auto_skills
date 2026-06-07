import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { collectWorkflowArtifacts, relativePathToPythonTopModule } from '../WorkflowArtifactRegistry';
import type { WorkflowDefinition } from '../WorkflowDefinition';

test('relativePathToPythonTopModule extracts top-level module', () => {
  assert.equal(relativePathToPythonTopModule('reader.py'), 'reader');
  assert.equal(relativePathToPythonTopModule('pkg/mod.py'), 'mod');
  assert.equal(relativePathToPythonTopModule('config.yaml'), undefined);
});

test('collectWorkflowArtifacts gathers writeOutputToFile and file-write paths', () => {
  const wf: WorkflowDefinition = {
    id: 'wf_art',
    version: '2.0',
    meta: { title: 't', taskType: 'prototype', userInput: 'x', createdAt: new Date().toISOString() },
    stages: [
      {
        id: 'stage_impl_prototype_config',
        title: 'config',
        tool: 'llm-text',
        toolConfig: {
          type: 'llm-text',
          systemPrompt: 'x',
          writeOutputToFile: 'config.yaml',
          writePathBase: 'workspace',
        },
        input: { sources: [], mergeStrategy: 'concat' },
        outputs: [{ key: 'fileContent', format: 'text' }],
        pauseAfter: false,
      },
      {
        id: 'stage_impl_prototype_reader',
        title: 'reader',
        tool: 'llm-text',
        toolConfig: {
          type: 'llm-text',
          systemPrompt: 'x',
          writeOutputToFile: 'reader.py',
          writePathBase: 'workspace',
        },
        input: { sources: [], mergeStrategy: 'concat' },
        outputs: [{ key: 'fileContent', format: 'text' }],
        pauseAfter: false,
      },
    ],
  };
  const reg = collectWorkflowArtifacts(wf);
  assert.equal(reg.pathSet.has('config.yaml'), true);
  assert.equal(reg.pathSet.has('reader.py'), true);
  assert.equal(reg.moduleSet.has('reader'), true);
  assert.equal(reg.moduleSet.has('config'), false);
});
