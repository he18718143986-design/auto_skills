import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import type { WorkflowDefinition } from '../WorkflowDefinition';
import {
  canProceedRetry,
  countDecisionRetryDownstreamStages,
  formatDecisionRetryConfirmMessage,
  getDecisionApproveAction,
  shouldAskRetryConfirm,
} from '../DecisionReviewUi';

test('decision approve button: incomplete checklist enters soft-prompt branch', () => {
  const action = getDecisionApproveAction(6, 4);
  assert.equal(action, 'show-soft-prompt');
});

test('decision approve button: all checks done enters approve-now branch', () => {
  const action = getDecisionApproveAction(6, 6);
  assert.equal(action, 'approve-now');
});

test('decision retry button: with prior approved decision requires confirm', () => {
  assert.equal(shouldAskRetryConfirm(1), true);
  assert.equal(canProceedRetry(1, false), false);
  assert.equal(canProceedRetry(1, true), true);
});

test('decision retry button: no approved decision proceeds directly', () => {
  assert.equal(shouldAskRetryConfirm(0), false);
  assert.equal(canProceedRetry(0, false), true);
});

test('decision retry confirm message includes downstream stage count', () => {
  const def: WorkflowDefinition = {
    id: 'wf',
    version: '2.0',
    meta: { title: 't', taskType: 'auto', userInput: 'u', createdAt: new Date().toISOString() },
    stages: [
      {
        id: 'stage_decide',
        title: 'd',
        tool: 'llm-text',
        toolConfig: { type: 'llm-text', systemPrompt: 'x' },
        input: { sources: [], mergeStrategy: 'concat' },
        outputs: [{ key: 'decisionRecord', format: 'markdown' }],
        pauseAfter: true,
        isDecisionStage: true,
      },
      {
        id: 'stage_impl',
        title: 'i',
        tool: 'llm-text',
        toolConfig: { type: 'llm-text', systemPrompt: 'y' },
        input: {
          sources: [
            { type: 'stage-output', stageId: 'stage_decide', outputKey: 'decisionRecord' },
          ],
          mergeStrategy: 'concat',
        },
        outputs: [{ key: 'out', format: 'text' }],
        pauseAfter: false,
      },
      {
        id: 'stage_other',
        title: 'o',
        tool: 'llm-text',
        toolConfig: { type: 'llm-text', systemPrompt: 'z' },
        input: { sources: [], mergeStrategy: 'concat' },
        outputs: [{ key: 'out2', format: 'text' }],
        pauseAfter: false,
      },
    ],
  };
  assert.equal(countDecisionRetryDownstreamStages(def, 'stage_decide'), 1);
  assert.match(formatDecisionRetryConfirmMessage(2), /2 个下游阶段/);
  assert.match(formatDecisionRetryConfirmMessage(0), /清除其下游/);
});
