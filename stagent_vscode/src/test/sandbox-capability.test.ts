import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as os from 'node:os';
import {
  assertSandboxEnforcementAvailable,
  isSandboxExecOnPath,
  resolveSandboxCapability,
  SANDBOX_CAPABILITY_MATRIX,
  SandboxEnforcementUnavailableError,
} from '../sandbox/SandboxCapabilityMatrix';
import { runInSandbox } from '../SandboxExecutor';

const isDarwin = process.platform === 'darwin';
const isLinux = process.platform === 'linux';
const isWindows = process.platform === 'win32';
const cwd = os.tmpdir();

test('SANDBOX_CAPABILITY_MATRIX documents darwin/linux/win32 rows', () => {
  assert.ok(SANDBOX_CAPABILITY_MATRIX.darwin);
  assert.equal(SANDBOX_CAPABILITY_MATRIX.darwin!.enforcedWhenAvailable, true);
  assert.ok(SANDBOX_CAPABILITY_MATRIX.linux);
  assert.equal(SANDBOX_CAPABILITY_MATRIX.linux!.enforcedWhenAvailable, false);
  assert.ok(SANDBOX_CAPABILITY_MATRIX.win32);
  assert.equal(SANDBOX_CAPABILITY_MATRIX.win32!.enforcedWhenAvailable, false);
});

test('resolveSandboxCapability reports darwin-enforced when sandbox-exec is on PATH', {
  skip: !isDarwin,
}, () => {
  const cap = resolveSandboxCapability();
  assert.equal(cap.platform, 'darwin');
  if (isSandboxExecOnPath()) {
    assert.equal(cap.sandboxEnforced, true);
    assert.equal(cap.isolation, 'kernel-sandbox-exec');
  } else {
    assert.equal(cap.sandboxEnforced, false);
  }
});

test('resolveSandboxCapability reports non-enforced on Linux', { skip: !isLinux }, () => {
  const cap = resolveSandboxCapability();
  assert.equal(cap.platform, 'linux');
  assert.equal(cap.sandboxEnforced, false);
  assert.equal(cap.isolation, 'soft-constraints-only');
});

test('assertSandboxEnforcementAvailable throws on non-darwin platforms', {
  skip: isDarwin,
}, () => {
  assert.throws(() => assertSandboxEnforcementAvailable(), SandboxEnforcementUnavailableError);
});

test('runInSandbox fail-closed when requireEnforced on non-darwin', {
  skip: isDarwin || isWindows,
}, async () => {
  await assert.rejects(
    () => runInSandbox('echo hi', cwd, { networkAllowed: true, requireEnforced: true }),
    (e: unknown) => e instanceof SandboxEnforcementUnavailableError,
  );
});

test('runInSandbox allows soft-constraints without requireEnforced on Linux', {
  skip: !isLinux,
}, async () => {
  const result = await runInSandbox('echo linux-soft', cwd, { networkAllowed: true });
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /linux-soft/);
});

test('runInSandbox fail-closed on darwin when sandbox-exec missing and requireEnforced', {
  skip: !isDarwin || isSandboxExecOnPath(),
}, async () => {
  await assert.rejects(
    () => runInSandbox('echo hi', cwd, { networkAllowed: true, requireEnforced: true }),
    (e: unknown) => e instanceof SandboxEnforcementUnavailableError,
  );
});
