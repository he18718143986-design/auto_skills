import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { evaluateDefinitionOfDone, readDefinitionOfDoneFromWorkspace } from '../dod/DefinitionOfDone';

test('evaluateDefinitionOfDone checks deliverable file_exists', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dod-'));
  fs.mkdirSync(path.join(dir, '.stagent'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.stagent/dod.json'),
    JSON.stringify({ deliverables: [{ path: 'out/report.csv', kind: 'file_exists' }] }),
    'utf8',
  );
  fs.mkdirSync(path.join(dir, 'out'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'out/report.csv'), 'a\n', 'utf8');

  const dod = readDefinitionOfDoneFromWorkspace(dir);
  assert.ok(dod?.deliverables?.length === 1);

  const evalOk = evaluateDefinitionOfDone({ workspaceRoot: dir, smokeStageDone: false });
  assert.equal(evalOk.configured, true);
  assert.equal(evalOk.deliverablesSatisfied, 1);
  assert.equal(evalOk.reasons.length, 0);

  fs.unlinkSync(path.join(dir, 'out/report.csv'));
  const evalMissing = evaluateDefinitionOfDone({ workspaceRoot: dir, smokeStageDone: false });
  assert.ok(evalMissing.reasons.some((r) => r.includes('report.csv')));
});
