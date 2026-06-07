import assert from 'node:assert/strict';
import * as os from 'node:os';
import { test } from 'node:test';
import { spawnShellWithTimeout } from '../process/ProcessRunner';

test('spawnShellWithTimeout succeeds for echo', async () => {
  const result = await spawnShellWithTimeout(
    os.platform() === 'win32' ? 'echo ok' : 'echo ok',
    { cwd: os.tmpdir(), timeoutMs: 10_000 },
  );
  assert.equal(result.timedOut, false);
  assert.ok(result.stdout.includes('ok'));
});

test('spawnShellWithTimeout sets timedOut on short limit', async () => {
  const slow = os.platform() === 'win32' ? 'ping -n 3 127.0.0.1' : 'sleep 2';
  const result = await spawnShellWithTimeout(slow, { cwd: os.tmpdir(), timeoutMs: 50 });
  assert.equal(result.timedOut, true);
});
