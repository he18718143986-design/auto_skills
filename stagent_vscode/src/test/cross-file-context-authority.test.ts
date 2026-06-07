import test from 'node:test';
import assert from 'node:assert/strict';
import { lintCrossFileKeyContract } from '../CrossFileKeyContractLint';

test('M24-F1: CONTEXT authority flags non-canonical keys', () => {
  const result = lintCrossFileKeyContract(
    [
      { path: 'reader.py', content: "row = {'tk_sku': 1, 'wrong_key': 2}" },
      { path: 'writer.py', content: "x = row.get('tk_sku')" },
    ],
    ['tk_sku', 'stock'],
    { contextAsSoleAuthority: true },
  );
  assert.ok(result.warnings.some((w) => w.includes('wrong_key') && w.includes('non-canonical-key')));
});

test('without CONTEXT uses near-miss heuristic', () => {
  const result = lintCrossFileKeyContract(
    [
      { path: 'a.py', content: "d = {'tk_sku': 1}" },
      { path: 'b.py', content: "row.get('sku')" },
    ],
    undefined,
  );
  assert.ok(result.warnings.some((w) => w.includes('cross-file-key-mismatch')));
});
