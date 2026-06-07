import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  REUSE_STRATEGY_OPTIONS,
  resolveReuseStrategyFromClarify,
} from '../ReuseStrategy';

test('#16 each option label maps back to its own value (single source of truth)', () => {
  for (const opt of REUSE_STRATEGY_OPTIONS) {
    assert.equal(resolveReuseStrategyFromClarify(opt.label), opt.value);
  }
});

test('#16 enum value passthrough is accepted (forward-compatible with structured answers)', () => {
  for (const opt of REUSE_STRATEGY_OPTIONS) {
    assert.equal(resolveReuseStrategyFromClarify(opt.value), opt.value);
  }
});

test('#16 empty / unknown answers fall back to regenerate', () => {
  assert.equal(resolveReuseStrategyFromClarify(undefined), 'regenerate');
  assert.equal(resolveReuseStrategyFromClarify(''), 'regenerate');
  assert.equal(resolveReuseStrategyFromClarify('   '), 'regenerate');
  assert.equal(resolveReuseStrategyFromClarify('随便写点别的'), 'regenerate');
  // 旧模糊匹配会把仅含「部分」的任意文案误判为 reuse-partial；精确匹配不再误命中。
  assert.equal(resolveReuseStrategyFromClarify('部分内容需要保留'), 'regenerate');
});

test('#16 options cover all three strategies exactly once', () => {
  const values = REUSE_STRATEGY_OPTIONS.map((o) => o.value).sort();
  assert.deepEqual(values, ['regenerate', 'reuse-all', 'reuse-partial']);
});
