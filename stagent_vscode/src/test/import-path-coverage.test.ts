import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { importPathCoveredByArtifacts } from '../artifact-registry/importPathCoverage';
import { collectWorkflowArtifacts } from '../WorkflowArtifactRegistry';
import type { WorkflowDefinition } from '../WorkflowDefinition';

test('importPathCoveredByArtifacts: ../src/index matches server/src/index.ts in registry', () => {
  const wf: WorkflowDefinition = {
    id: 'wf',
    version: '2.0',
    meta: { title: 't', taskType: 'software', userInput: 'x', createdAt: '2026-01-01T00:00:00.000Z' },
    stages: [
      {
        id: 'stage_impl_server_entry',
        title: 'entry',
        tool: 'llm-text',
        toolConfig: {
          type: 'llm-text',
          systemPrompt: 'x',
          writeOutputToFile: 'server/src/index.ts',
        },
        input: { sources: [], mergeStrategy: 'concat' },
        outputs: [{ key: 'out', format: 'text' }],
        pauseAfter: false,
      },
    ],
  };
  const registry = collectWorkflowArtifacts(wf);
  assert.equal(importPathCoveredByArtifacts('../src/index', registry), true);
  assert.equal(importPathCoveredByArtifacts('../src/app', registry), false);
});
