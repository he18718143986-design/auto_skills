import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  classifyStageOutputSource,
  planInputDegradeMode,
  thresholdsForRole,
} from '../input-context/degradePolicy';
import {
  allocateContextBudget,
  classifyInputSourceBudgetCategory,
  truncateTextToTokenBudget,
  STAGENT_CODEBASE_SNAPSHOT_LABEL,
} from '../input-context/budgetAllocation';
import { block, warn, isImplStage, isTestRunStage } from '../quality-gates/gateHelpers';
import type { Stage } from '../WorkflowDefinition';

test('degradePolicy submodule is independently importable and consistent', () => {
  assert.equal(
    classifyStageOutputSource({ type: 'stage-output', outputKey: 'decisionRecord' }),
    'decision-record',
  );
  assert.equal(planInputDegradeMode(0, 'default'), 'full');
  assert.equal(thresholdsForRole('implementation').preserveOnTotalOverflow, true);
});

test('budgetAllocation submodule allocates within the available pool', () => {
  assert.equal(
    classifyInputSourceBudgetCategory({ type: 'user-input', label: 'x' }),
    'user-input',
  );
  assert.equal(
    classifyInputSourceBudgetCategory({ type: 'stage-output', label: STAGENT_CODEBASE_SNAPSHOT_LABEL }),
    'codebase-snapshot',
  );
  const { budget, allocations } = allocateContextBudget(
    [{ type: 'user-input', label: 'u' }],
    8000,
    { sourceTokenCounts: [10], reservedForOutput: 100 },
  );
  assert.ok(budget.availableForInput > 0);
  assert.equal(allocations[0].grantedTokens, 10);
  assert.equal(truncateTextToTokenBudget('abcdefgh', 1), 'abcd\n\n[内容已截断以符合上下文 token 预算]');
});

test('gateHelpers submodule builds gate results and classifies stages', () => {
  assert.deepEqual(block('g1', ['m']), { gateId: 'g1', severity: 'block', messages: ['m'], meta: undefined });
  assert.equal(warn('g2', ['m']).severity, 'warn');
  assert.equal(isImplStage(undefined), false);
  assert.equal(isTestRunStage({ id: 'stage_test_run_x' } as unknown as Stage), true);
});
