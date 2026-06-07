import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { getPauseUiState } from '../WebviewPauseUiState';

test('paused + decision stage should use decision mode', () => {
  const ui = getPauseUiState('stage_decide_api', { stage_decide_api: 'paused' }, (id) => id === 'stage_decide_api');
  assert.equal(ui.showPauseBar, true);
  assert.equal(ui.mode, 'decision');
  assert.equal(ui.enableRetry, true);
  assert.equal(ui.enableApproveDecision, true);
  assert.equal(ui.enableApprove, false);
});

test('paused + normal stage should use normal mode', () => {
  const ui = getPauseUiState('stage_impl_api', { stage_impl_api: 'paused' }, () => false);
  assert.equal(ui.showPauseBar, true);
  assert.equal(ui.mode, 'normal');
  assert.equal(ui.enableRetry, true);
  assert.equal(ui.enableApprove, true);
  assert.equal(ui.enableApproveDecision, false);
});

test('paused at retry limit disables retry and exposes a hint', () => {
  const normal = getPauseUiState('stage_impl_api', { stage_impl_api: 'paused' }, () => false, true);
  assert.equal(normal.showPauseBar, true);
  assert.equal(normal.enableRetry, false);
  assert.equal(normal.enableApprove, true);
  assert.ok(normal.retryDisabledHint && normal.retryDisabledHint.length > 0);

  const decision = getPauseUiState('stage_decide_api', { stage_decide_api: 'paused' }, () => true, true);
  assert.equal(decision.enableRetry, false);
  assert.equal(decision.enableApproveDecision, true);
  assert.ok(decision.retryDisabledHint);
});

test('running stage should hide pause bar and disable actions', () => {
  const ui = getPauseUiState('stage_decide_api', { stage_decide_api: 'running' }, () => true);
  assert.equal(ui.showPauseBar, false);
  assert.equal(ui.mode, null);
  assert.equal(ui.enableRetry, false);
  assert.equal(ui.enableApprove, false);
  assert.equal(ui.enableApproveDecision, false);
});
