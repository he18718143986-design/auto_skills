import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { patchNpmDefaultTestScriptAfterInit } from '../disk-bootstrap/npmWorkspace';

test('patchNpmDefaultTestScriptAfterInit atomically updates package.json', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stagent-npm-'));
  const pkgPath = path.join(dir, 'package.json');
  fs.writeFileSync(
    pkgPath,
    `${JSON.stringify({ scripts: { test: 'echo \\"Error: no test specified\\" && exit 1' } }, null, 2)}\n`,
    'utf-8',
  );

  const patched = patchNpmDefaultTestScriptAfterInit(dir);
  assert.equal(patched, true);

  const parsed = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { scripts: { test: string } };
  assert.equal(parsed.scripts.test, 'node -e "process.exit(0)"');
  assert.equal(fs.readdirSync(dir).some((n) => n.includes('.tmp-')), false);

  fs.rmSync(dir, { recursive: true, force: true });
});
