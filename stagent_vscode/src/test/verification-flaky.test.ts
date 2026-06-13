import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  confidenceScoreForFlakySummary,
  summarizeVerificationRuns,
} from '../quality-gates/verificationFlaky';

test('summarizeVerificationRuns detects flaky pass/fail mix', () => {
  const s = summarizeVerificationRuns([
    { attempt: 1, exitCode: 0 },
    { attempt: 2, exitCode: 1 },
    { attempt: 3, exitCode: 0 },
  ]);
  assert.equal(s.flaky, true);
  assert.equal(s.stable, false);
  assert.equal(s.passCount, 2);
});

test('confidenceScoreForFlakySummary lowers score on flaky', () => {
  const flaky = summarizeVerificationRuns([
    { attempt: 1, exitCode: 0 },
    { attempt: 2, exitCode: 1 },
  ]);
  assert.equal(confidenceScoreForFlakySummary(flaky), 0.45);
  const stable = summarizeVerificationRuns([
    { attempt: 1, exitCode: 0 },
    { attempt: 2, exitCode: 0 },
  ]);
  assert.equal(confidenceScoreForFlakySummary(stable), 0.95);
});
