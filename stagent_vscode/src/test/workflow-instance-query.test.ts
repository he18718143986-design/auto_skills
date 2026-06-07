import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import type { WorkflowInstance } from '../WorkflowDefinition';
import { buildTaskListItem, countCompletedStages } from '../WorkflowInstanceQuery';

function minimalInstance(stageStatuses: string[]): WorkflowInstance {
  const stages = stageStatuses.map((_, i) => ({
    id: 'stage_' + i,
    title: 'S' + i,
    tool: 'llm-text' as const,
    toolConfig: { type: 'llm-text' as const, systemPrompt: 'x' },
    input: { sources: [], mergeStrategy: 'concat' as const },
    outputs: [{ key: 'out', format: 'text' as const }],
    pauseAfter: false,
  }));
  return {
    definition: {
      id: 'wf',
      version: '2.0',
      meta: { title: 't', taskType: 'auto', userInput: 'u', createdAt: new Date().toISOString() },
      stages,
    },
    currentStageIndex: 0,
    status: 'running',
    stageRuntimes: stageStatuses.map((status, i) => ({
      stageId: 'stage_' + i,
      status: status as 'pending',
      outputs: {},
      retryCount: 0,
    })),
  };
}

test('countCompletedStages counts done and skipped', () => {
  const inst = minimalInstance(['done', 'running', 'skipped', 'pending']);
  assert.equal(countCompletedStages(inst), 2);
  const item = buildTaskListItem('key', inst);
  assert.equal(item.completedStages, 2);
});
