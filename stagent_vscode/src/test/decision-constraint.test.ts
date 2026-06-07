import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { promptIncludesDecisionConstraint } from '../rule20/decisionConstraint';
import { IMPL_DECISION_CONSTRAINT_SNIPPET } from '../rule20-normalize/types';

test('promptIncludesDecisionConstraint accepts full snippet', () => {
  assert.equal(promptIncludesDecisionConstraint(IMPL_DECISION_CONSTRAINT_SNIPPET), true);
});

test('promptIncludesDecisionConstraint accepts core phrase without suffix', () => {
  assert.equal(promptIncludesDecisionConstraint('严格按照已确认的决策清单实现'), true);
  assert.equal(promptIncludesDecisionConstraint('prefix 严格按照已确认的决策清单实现 suffix'), true);
  assert.equal(promptIncludesDecisionConstraint('no constraint here'), false);
});
