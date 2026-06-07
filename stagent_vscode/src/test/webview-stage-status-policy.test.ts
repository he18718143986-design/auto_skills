import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { applyStageStatusUpdate, coerceExecStageStatus, shouldRejectStageStatusDowngrade } from '../webview/shared/stageStatusPolicy';

test('shouldRejectStageStatusDowngrade: done cannot become error', () => {
  assert.equal(shouldRejectStageStatusDowngrade('done', 'error'), true);
  assert.equal(shouldRejectStageStatusDowngrade('skipped', 'error'), true);
  assert.equal(shouldRejectStageStatusDowngrade('error', 'done'), false);
  assert.equal(shouldRejectStageStatusDowngrade('running', 'error'), false);
});

test('applyStageStatusUpdate: preserves done on late error', () => {
  assert.equal(applyStageStatusUpdate('done', 'error'), 'done');
  assert.equal(applyStageStatusUpdate('done', 'done'), 'done');
  assert.equal(applyStageStatusUpdate('error', 'done'), 'done');
});

test('coerceExecStageStatus: typo warns and falls back to pending (no throw in test)', () => {
  const warnings: string[] = [];
  const orig = console.warn;
  console.warn = (msg: string) => warnings.push(msg);
  try {
    assert.equal(coerceExecStageStatus('typo-status'), 'pending');
    assert.ok(warnings.some((w) => w.includes('invalid stageStatus')));
  } finally {
    console.warn = orig;
  }
});
