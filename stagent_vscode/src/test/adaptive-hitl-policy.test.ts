import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  DEFAULT_HITL_POLICY,
  evaluateHITL,
  shouldPauseAfterStage,
} from '../AdaptiveHITLPolicy';
import type { Stage, StageRuntime } from '../WorkflowDefinition';
import type { ConfidenceResult } from '../ConfidenceScorer';
import { scoreToConfidenceLevel } from '../ConfidenceBands';

function stage(partial: Partial<Stage> & Pick<Stage, 'id'>): Stage {
  return {
    title: partial.id,
    tool: 'llm-text',
    toolConfig: { type: 'llm-text', systemPrompt: 'x' },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'out', format: 'text' }],
    pauseAfter: false,
    ...partial,
  };
}

function runtime(retryCount = 0): StageRuntime {
  return { stageId: 's', status: 'running', outputs: {}, retryCount };
}

function confidence(score: number): ConfidenceResult {
  return { score, level: scoreToConfidenceLevel(score), reasons: ['test'] };
}

test('decision stage always pauses even with high confidence', () => {
  const st = stage({ id: 'stage_decide_x', isDecisionStage: true, pauseAfter: false });
  const decision = evaluateHITL(st, runtime(), confidence(0.95), DEFAULT_HITL_POLICY);
  assert.notEqual(decision.action, 'auto-advance');
});

test('explicit pauseAfter=true bypasses auto-advance', () => {
  const st = stage({ id: 'stage_impl_x', pauseAfter: true });
  const decision = evaluateHITL(st, runtime(), confidence(0.99), DEFAULT_HITL_POLICY);
  assert.equal(decision.action, 'pause');
});

test('low confidence impl stage pauses when pauseAfter=false', () => {
  const st = stage({ id: 'stage_impl_x', pauseAfter: false });
  assert.equal(
    shouldPauseAfterStage(st, runtime(), confidence(0.2), DEFAULT_HITL_POLICY),
    true,
  );
});

test('high confidence impl stage auto-advances when pauseAfter=false', () => {
  const st = stage({ id: 'stage_impl_x', pauseAfter: false });
  assert.equal(
    shouldPauseAfterStage(st, runtime(), confidence(0.9), DEFAULT_HITL_POLICY),
    false,
  );
});

test('retry count at policy limit forces pause', () => {
  const st = stage({ id: 'stage_impl_x', pauseAfter: false });
  const rt = runtime(2);
  const decision = evaluateHITL(st, rt, confidence(0.9), DEFAULT_HITL_POLICY);
  assert.equal(decision.action, 'pause');
});
