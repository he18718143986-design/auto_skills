import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { buildSliceHealthRows } from '../webview/shared/sliceHealthModel';

test('buildSliceHealthRows: groups impl/test/fix by semantic key', () => {
  const rows = buildSliceHealthRows(
    [
      { id: 'stage_impl_market_connector' },
      { id: 'stage_test_run_market_connector' },
      { id: 'stage_fix_if_failed_market_connector' },
    ],
    {
      'stage_impl_market_connector': 'done',
      'stage_test_run_market_connector': 'done',
      'stage_fix_if_failed_market_connector': 'running',
    },
    { 'stage_test_run_market_connector': 'deferred' },
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.semanticKey, 'market_connector');
  assert.equal(rows[0]!.implStatus, 'done');
  assert.equal(rows[0]!.testRunSemantic, 'deferred');
  assert.equal(rows[0]!.fixStatus, 'running');
});
