import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { computeCharterCoverageMetrics } from '../charter/CharterCoverageMetrics';
import type { Stage, StageRuntime, WorkflowDefinition } from '../WorkflowDefinition';

function decisionStage(id: string): Stage {
  return {
    id,
    title: id,
    tool: 'llm-text',
    isDecisionStage: true,
    toolConfig: { type: 'llm-text', systemPrompt: 'x' },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'decisionRecord', format: 'markdown' }],
    pauseAfter: true,
  };
}

function doneRuntime(stageId: string, provenance?: StageRuntime['decisionProvenance']): StageRuntime {
  return {
    stageId,
    status: 'done',
    outputs: {},
    retryCount: 0,
    decisionProvenance: provenance,
  };
}

test('computeCharterCoverageMetrics counts provenance mix', () => {
  const definition: WorkflowDefinition = {
    id: 'wf',
    version: '2.0',
    meta: { title: 't', taskType: 'software', userInput: 'u', createdAt: new Date().toISOString() },
    stages: [
      decisionStage('d1'),
      decisionStage('d2'),
      decisionStage('d3'),
    ],
  };
  const instance = {
    definition,
    stageRuntimes: [
      doneRuntime('d1', 'charter_direct'),
      doneRuntime('d2', 'human'),
      doneRuntime('d3', 'escalated'),
    ],
    currentStageIndex: 3,
    status: 'completed' as const,
  };
  const m = computeCharterCoverageMetrics(instance);
  assert.equal(m.decisionStages, 3);
  assert.equal(m.charter_direct, 1);
  assert.equal(m.human, 1);
  assert.equal(m.escalated, 1);
  assert.equal(m.coverageRate, 0.333);
});
