import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  buildDeterministicExecEnv,
  pinInstallCommandForLockfile,
} from '../quality-gates/deterministicVerification';

test('buildDeterministicExecEnv pins TZ and CI', () => {
  const env = buildDeterministicExecEnv({ FOO: 'bar' });
  assert.equal(env.TZ, 'UTC');
  assert.equal(env.CI, '1');
  assert.equal(env.PYTHONHASHSEED, '0');
  assert.equal(env.FOO, 'bar');
});

test('pinInstallCommandForLockfile uses npm ci when package-lock exists', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stagent-pin-'));
  fs.writeFileSync(path.join(dir, 'package-lock.json'), '{}');
  const out = pinInstallCommandForLockfile('cd app && npm install && npm test', dir);
  assert.ok(out.includes('npm ci'));
  assert.ok(!/\bnpm install\b/.test(out));
});
