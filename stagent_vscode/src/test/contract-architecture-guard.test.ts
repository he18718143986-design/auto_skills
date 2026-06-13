import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';

const ROOT = path.resolve(__dirname, '..', '..');

test('plan-completeness does not statically import workflow-self-heal', () => {
  const rel = 'src/plan-completeness/lintPlanCompleteness.ts';
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  assert.doesNotMatch(src, /workflow-self-heal/);
});

test('contract-infra is the shared infra dependency for plan and self-heal consumers', () => {
  const pythonChecks = fs.readFileSync(path.join(ROOT, 'src/plan-completeness/pythonTestInfraChecks.ts'), 'utf8');
  assert.match(pythonChecks, /contract-infra/);

  const pythonVenvChain = fs.readFileSync(path.join(ROOT, 'src/workflow-self-heal/pythonVenvChain.ts'), 'utf8');
  assert.match(pythonVenvChain, /contract-infra/);
});
