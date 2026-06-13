import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { buildTaskPolishSystemPrompt } from '../TaskPolishPrompt';

test('buildTaskPolishSystemPrompt embeds taskType and Stagent wording', () => {
  const p = buildTaskPolishSystemPrompt('software', 'standard');
  assert.match(p, /software/);
  assert.match(p, /Stagent/);
  assert.match(p, /600～2200/);
});

test('buildTaskPolishSystemPrompt light tier caps scope for simple tasks', () => {
  const p = buildTaskPolishSystemPrompt('auto', 'light');
  assert.match(p, /120～500/);
  assert.match(p, /单文件或单切片/);
  assert.match(p, /润色档位: 轻量/);
  assert.doesNotMatch(p, /600～2200/);
});

test('buildTaskPolishSystemPrompt auto mode asks model to infer taskType context', () => {
  const p = buildTaskPolishSystemPrompt('auto', 'standard');
  assert.match(p, /software \/ refactor \/ debug \/ prototype/);
});
