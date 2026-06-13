import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { inferPolishTierFromDraft, resolvePolishTier } from '../polish/PolishTier';

test('inferPolishTierFromDraft prefers light for short script drafts', () => {
  assert.equal(inferPolishTierFromDraft('写一个简单计算器脚本，单文件即可'), 'light');
  assert.equal(inferPolishTierFromDraft('hello world greet CLI'), 'light');
});

test('inferPolishTierFromDraft prefers standard for complex delivery drafts', () => {
  assert.equal(
    inferPolishTierFromDraft('构建全栈微服务，多模块架构，需要垂直切片与 AFK 验收'),
    'standard',
  );
});

test('resolvePolishTier honors explicit tier and falls back to infer for auto', () => {
  assert.equal(resolvePolishTier('light', '任意草稿'), 'light');
  assert.equal(resolvePolishTier('standard', '单文件脚本'), 'standard');
  assert.equal(resolvePolishTier('auto', '简单 greet 脚本'), 'light');
  assert.equal(resolvePolishTier(undefined, '简单 greet 脚本'), 'light');
});
