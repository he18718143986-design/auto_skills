import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import type { WorkflowDefinition } from '../WorkflowDefinition';
import { verifyRule20 } from '../Rule20Verify';

const fixturePath = path.join(
  __dirname,
  '../../scripts/fixtures/debug/fail-feedback-loop-order.json',
);

function loadFixture(): WorkflowDefinition {
  return JSON.parse(fs.readFileSync(fixturePath, 'utf-8')) as WorkflowDefinition;
}

test('debug feedback loop: warn mode keeps debug-feedback-loop-not-first as warning', () => {
  const wf = loadFixture();
  const result = verifyRule20(wf, { debugFeedbackLoopMode: 'warn' });
  assert.ok(result.warnings.some((w) => w.type === 'debug-feedback-loop-not-first'));
  assert.ok(!result.violations.some((v) => v.type === 'debug-feedback-loop-not-first'));
});

test('debug feedback loop: hard mode promotes to violation', () => {
  const wf = loadFixture();
  const result = verifyRule20(wf, { debugFeedbackLoopMode: 'hard' });
  assert.ok(result.violations.some((v) => v.type === 'debug-feedback-loop-not-first'));
  assert.equal(result.passed, false);
});

test('debug feedback loop: off mode does not promote', () => {
  const wf = loadFixture();
  const result = verifyRule20(wf, { debugFeedbackLoopMode: 'off' });
  assert.ok(result.warnings.some((w) => w.type === 'debug-feedback-loop-not-first'));
  assert.equal(result.violations.length, 0);
});
