import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { GATE_ID_TEST_RUN_PREFLIGHT } from '../QualityGateIds';
import { planDiagnosticRouteFromGateBlock, planDiagnosticRouteFromStageError } from '../diagnostic-router';

test('planDiagnosticRouteFromGateBlock routes missing venv to bootstrap', () => {
  const route = planDiagnosticRouteFromGateBlock(
    {
      gateId: GATE_ID_TEST_RUN_PREFLIGHT,
      severity: 'block',
      messages: ['missing venv'],
      meta: { issue: { code: 'missing-python-venv', message: 'x', hint: 'y' } },
    },
    'stage_test_run_calc',
  );
  assert.ok(route);
  assert.equal(route!.category, 'config');
  assert.equal(route!.action, 'bootstrap');
});

test('planDiagnosticRouteFromStageError routes import errors to gate_repair', () => {
  const route = planDiagnosticRouteFromStageError({
    stageId: 'stage_test_run_x',
    errorType: 'tool-execution-failed',
    message: 'ModuleNotFoundError: No module named foo',
    stderr: 'ImportError',
  });
  assert.equal(route.category, 'symbol');
  assert.equal(route.action, 'gate_repair');
});

test('planDiagnosticRouteFromStageError routes pytest assertion to fix_chain', () => {
  const route = planDiagnosticRouteFromStageError({
    stageId: 'stage_test_run_x',
    errorType: 'tool-execution-failed',
    message: 'AssertionError: expected 2',
    stderr: 'FAILED tests/test_x.py',
  });
  assert.equal(route.category, 'assertion');
  assert.equal(route.action, 'fix_chain');
});
