import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');

test('lintPlanCompleteness does not statically import workflow-self-heal', () => {
  const rel = 'src/plan-completeness/lintPlanCompleteness.ts';
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  assert.match(src, /detectSelfHealGaps/);
  assert.doesNotMatch(src, /workflow-self-heal/);
  assert.doesNotMatch(src, /auditSelfHealGaps/);
});
