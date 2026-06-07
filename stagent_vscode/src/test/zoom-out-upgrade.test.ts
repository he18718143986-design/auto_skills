import test from 'node:test';
import assert from 'node:assert/strict';
import { upgradeZoomOutStageToLlmText } from '../WorkflowRule20Normalize';
import type { WorkflowDefinition } from '../WorkflowDefinition';

test('M25-F2 upgradeZoomOutStageToLlmText converts file-read', () => {
  const wf: WorkflowDefinition = {
    id: 'w',
    version: '2.0',
    meta: {
      title: 't',
      taskType: 'refactor',
      userInput: 'u',
      createdAt: '2020-01-01T00:00:00Z',
      isGreenfield: false,
    },
    stages: [
      {
        id: 'stage_zoom_out',
        title: 'zoom',
        tool: 'file-read',
        toolConfig: { type: 'file-read', filePath: 'README.md' },
        input: { sources: [], mergeStrategy: 'concat' },
        outputs: [{ key: 'moduleMap', format: 'markdown' }],
        pauseAfter: false,
      },
    ],
  };
  assert.equal(upgradeZoomOutStageToLlmText(wf, 'term: tk_sku'), true);
  assert.equal(wf.stages[0].tool, 'llm-text');
});
