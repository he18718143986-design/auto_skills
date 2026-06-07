import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import type { Stage } from '../WorkflowDefinition';
import { PRIMARY_DECISION_OUTPUT_KEY } from '../WorkflowOutputKeys';
import {
  DECISION_STAGE_INVARIANT_I1_MSG,
  ensureDecisionStageOutput,
  ensureSoftwareWorkflowHasDecisionStage,
  normalizeDecisionStage,
  validateDecisionStageInvariants,
} from '../workflow/DecisionStageShape';
import type { WorkflowDefinition } from '../WorkflowDefinition';

function decisionStage(overrides: Partial<Stage> = {}): Stage {
  return {
    id: 'stage_decide_x',
    title: 'Decide',
    tool: 'llm-text',
    isDecisionStage: true,
    pauseAfter: false,
    toolConfig: { type: 'llm-text', systemPrompt: 'base' },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [],
    ...overrides,
  };
}

test('validateDecisionStageInvariants flags non-llm-text decision stage', () => {
  const errors = validateDecisionStageInvariants(
    decisionStage({ tool: 'code-runner', toolConfig: { type: 'code-runner', command: 'echo', captureOutput: true } }),
  );
  assert.ok(errors.some((e) => e.includes('I-1')));
});

test('ensureDecisionStageOutput adds decisionRecord output', () => {
  const stage = decisionStage();
  ensureDecisionStageOutput(stage);
  assert.equal(stage.outputs.some((o) => o.key === PRIMARY_DECISION_OUTPUT_KEY), true);
});

test('normalizeDecisionStage sets pauseAfter and applies strictPrompt', () => {
  const stage = decisionStage();
  normalizeDecisionStage(stage, {
    strictPrompt: (p) => `${p} [strict]`,
  });
  assert.equal(stage.pauseAfter, true);
  assert.match((stage.toolConfig as { systemPrompt: string }).systemPrompt, /\[strict\]/);
  assert.equal(stage.outputs[0]?.key, PRIMARY_DECISION_OUTPUT_KEY);
});

test('ensureSoftwareWorkflowHasDecisionStage promotes first stage', () => {
  const wf: WorkflowDefinition = {
    version: '2.0',
    id: 'wf',
    meta: { title: 't', taskType: 'software', userInput: 'u', createdAt: '2020-01-01T00:00:00Z' },
    stages: [
      {
        id: 'stage_impl_a',
        title: 'Impl',
        tool: 'llm-text',
        pauseAfter: false,
        toolConfig: { type: 'llm-text', systemPrompt: 'impl' },
        input: { sources: [], mergeStrategy: 'concat' },
        outputs: [{ key: 'implCode', format: 'markdown' }],
      },
    ],
  };
  ensureSoftwareWorkflowHasDecisionStage(wf, { strictPrompt: (p) => p });
  assert.equal(wf.stages[0].isDecisionStage, true);
  assert.equal(wf.stages[0].outputs.some((o) => o.key === PRIMARY_DECISION_OUTPUT_KEY), true);
});

test('DECISION_STAGE_INVARIANT_I1_MSG is stable for runtime errors', () => {
  assert.equal(DECISION_STAGE_INVARIANT_I1_MSG, '不变式 I-1：决策阶段必须使用 llm-text');
});
