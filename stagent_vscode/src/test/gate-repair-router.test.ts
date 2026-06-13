import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { GATE_ID_PYTHON_EXPORT_CONTRACT, GATE_ID_PYTHON_PYPI_SYMBOL } from '../QualityGateIds';
import {
  buildGateRepairPlaybookSteps,
  isRepairableGateBlock,
  parseGateRepairIssue,
  resolveGateRepairWriteTarget,
} from '../gate-repair/GateRepairRouter';

test('isRepairableGateBlock recognizes python gates', () => {
  assert.equal(isRepairableGateBlock(GATE_ID_PYTHON_EXPORT_CONTRACT), true);
  assert.equal(isRepairableGateBlock(GATE_ID_PYTHON_PYPI_SYMBOL), true);
  assert.equal(isRepairableGateBlock('sdk-path-contract-hard'), false);
});

test('parseGateRepairIssue extracts export-contract meta', () => {
  const repair = parseGateRepairIssue({
    gateId: GATE_ID_PYTHON_EXPORT_CONTRACT,
    severity: 'block',
    messages: ['missing symbol'],
    meta: {
      issue: {
        code: 'python-test-import-symbol-missing',
        message: 'missing',
        module: 'market_connector',
        symbol: 'MarketGateway',
        testFile: 'tests/test_market_connector.py',
        implFile: 'market_connector.py',
      },
    },
  });
  assert.equal(repair?.kind, 'python-export-contract');
  assert.equal(resolveGateRepairWriteTarget(repair!), 'market_connector.py');
  assert.ok(buildGateRepairPlaybookSteps(repair!).some((s) => s.includes('MarketGateway')));
});
