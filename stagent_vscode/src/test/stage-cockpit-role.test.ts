import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { cockpitRoleFromStage } from '../webview/shared/stageCockpitRole';

test('cockpitRoleFromStage maps test_write to verify', () => {
  assert.equal(cockpitRoleFromStage('stage_test_write_core'), 'verify');
});

test('cockpitRoleFromStage maps test_run to verify', () => {
  assert.equal(cockpitRoleFromStage('stage_test_run_core'), 'verify');
});

test('cockpitRoleFromStage maps impl to worker', () => {
  assert.equal(cockpitRoleFromStage('stage_impl_core'), 'worker');
});
