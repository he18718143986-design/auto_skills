import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  BUILTIN_WARNING_STAGE_COUNT_NEAR_LIMIT,
  BUILTIN_WARNING_STAGE_COUNT_EXCEEDS_50,
  CONTRACT_PREFIX,
  formatContractWarningColon,
  formatPlanIncompleteBlockReason,
  formatRule20TokenLine,
  parseWorkflowWarningLine,
  PLAN_INCOMPLETE_PREFIX,
  RULE20_SOFT_PREFIX,
  RULE20_VIOLATION_PREFIX,
} from '../lint/WorkflowWarningTokens';

test('formatRule20TokenLine matches parseWorkflowWarningLine', () => {
  const line = formatRule20TokenLine('violation', 'missing-decision-stage', 'stage_impl_x');
  assert.equal(line, `${RULE20_VIOLATION_PREFIX}:missing-decision-stage:stage_impl_x`);
  assert.deepEqual(parseWorkflowWarningLine(line), {
    kind: 'rule20-violation',
    type: 'missing-decision-stage',
    stageId: 'stage_impl_x',
  });
  const soft = formatRule20TokenLine('warning', 'model-tier-downgrade', 'workflow');
  assert.equal(soft, `${RULE20_SOFT_PREFIX}:model-tier-downgrade:workflow`);
  assert.deepEqual(parseWorkflowWarningLine(soft), {
    kind: 'rule20-soft',
    type: 'model-tier-downgrade',
    stageId: 'workflow',
  });
});

test('formatContractWarningColon and parse', () => {
  const line = formatContractWarningColon('impl-missing-decision-source', 'stage_impl_x');
  assert.equal(line, `${CONTRACT_PREFIX}:impl-missing-decision-source:stage_impl_x`);
  assert.deepEqual(parseWorkflowWarningLine(line), {
    kind: 'contract',
    type: 'impl-missing-decision-source',
    stageId: 'stage_impl_x',
  });
});

test('builtin and plan incomplete prefixes', () => {
  assert.deepEqual(parseWorkflowWarningLine(BUILTIN_WARNING_STAGE_COUNT_NEAR_LIMIT), {
    kind: 'builtin',
    type: BUILTIN_WARNING_STAGE_COUNT_NEAR_LIMIT,
  });
  assert.equal(
    formatPlanIncompleteBlockReason('[missing-verification-stage] msg'),
    `${PLAN_INCOMPLETE_PREFIX} [missing-verification-stage] msg`,
  );
  assert.equal(BUILTIN_WARNING_STAGE_COUNT_EXCEEDS_50, 'stage_count_exceeds_50');
});
