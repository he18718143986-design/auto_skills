import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  complexityEstimateToWarningLines,
  estimateWorkflowComplexity,
} from '../WorkflowComplexityEstimator';
import { COMPLEXITY_IMPL_THRESHOLD } from '../workflow/ComplexityEstimatorConstants';
import { GENERATION_STAGE_SOFT_CAP } from '../workflow/WorkflowStageBudget';
import { WORKFLOW_LEVEL_STAGE_ID } from '../workflow/WorkflowLevelIds';

test('multi-module user input triggers global architecture decision', () => {
  const est = estimateWorkflowComplexity('做一个完整项目的多模块管理系统');
  assert.equal(est.requiresGlobalArchitectureDecision, true);
  assert.ok(est.estimatedStageCount >= 10);
});

test('exceeds hard cap for large module estimate', () => {
  const est = estimateWorkflowComplexity(
    '模块 '.repeat(30) + '完整项目全栈端到端',
  );
  assert.equal(est.exceedsHardCap, true);
  const warnings = complexityEstimateToWarningLines(est);
  assert.ok(warnings.some((w) => w.startsWith('complexity:exceeds-hard-cap')));
});

test('impl threshold boundary uses COMPLEXITY_IMPL_THRESHOLD', () => {
  const below = estimateWorkflowComplexity('模块 '.repeat(COMPLEXITY_IMPL_THRESHOLD - 1));
  const at = estimateWorkflowComplexity('模块 '.repeat(COMPLEXITY_IMPL_THRESHOLD));
  assert.equal(below.requiresGlobalArchitectureDecision, false);
  assert.equal(at.requiresGlobalArchitectureDecision, true);
});

test('hard cap aligns with GENERATION_STAGE_SOFT_CAP and workflow level warnings', () => {
  const est = estimateWorkflowComplexity('模块 '.repeat(30) + '完整项目全栈端到端');
  assert.ok(est.estimatedStageCount > GENERATION_STAGE_SOFT_CAP);
  const warnings = complexityEstimateToWarningLines(est);
  assert.ok(
    warnings.some((w) => w.includes(`complexity:requires-global-architecture-decision:${WORKFLOW_LEVEL_STAGE_ID}`)),
  );
});
