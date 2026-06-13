import assert from 'node:assert/strict';
import test from 'node:test';
import { lintPythonExportContractFromPaths } from '../python-contract/PythonExportContractLint';

const MARKET_CONNECTOR_IMPL = `class TickData:
    pass

def connect():
    pass
`;

const MARKET_CONNECTOR_TEST = `from market_connector import MarketGateway, ReconnectEvent

def test_gateway():
    assert MarketGateway is not None
`;

test('lintPythonExportContractFromPaths: MarketGateway missing', () => {
  const issues = lintPythonExportContractFromPaths(
    [{ testPath: 'tests/test_market_connector.py', implPath: 'market_connector.py' }],
    (p) => (p.includes('test_') ? MARKET_CONNECTOR_TEST : MARKET_CONNECTOR_IMPL),
  );
  assert.equal(issues.length, 2);
  const symbols = issues.map((i) => i.symbol).sort();
  assert.deepEqual(symbols, ['MarketGateway', 'ReconnectEvent']);
});

test('lintPythonExportContractFromPaths: exported symbol passes', () => {
  const impl = MARKET_CONNECTOR_IMPL + '\nclass MarketGateway:\n    pass\n';
  const issues = lintPythonExportContractFromPaths(
    [{ testPath: 'tests/test_market_connector.py', implPath: 'market_connector.py' }],
    (p) => (p.includes('test_') ? 'from market_connector import MarketGateway\n' : impl),
  );
  assert.equal(issues.length, 0);
});
