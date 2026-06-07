import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { mapSandboxError, runInSandbox, SandboxExecutionError } from '../SandboxExecutor';
import { buildMacosSandboxProfile, sbplStringLiteral } from '../process/MacosSandboxProfile';

const isWindows = process.platform === 'win32';
const isDarwin = process.platform === 'darwin';
const cwd = os.tmpdir();

/** sandbox-exec 在 Cursor agent 等嵌套沙箱里可能 exit 71；探测失败则跳过集成测。 */
let sandboxIntegrationOk: boolean | null = null;

async function ensureSandboxIntegrationProbe(): Promise<boolean> {
  if (sandboxIntegrationOk !== null) {
    return sandboxIntegrationOk;
  }
  if (isWindows) {
    sandboxIntegrationOk = false;
    return false;
  }
  try {
    const result = await runInSandbox('echo sbx-probe-ok', cwd, { networkAllowed: true });
    sandboxIntegrationOk = result.exitCode === 0 && /sbx-probe-ok/.test(result.stdout);
  } catch {
    sandboxIntegrationOk = false;
  }
  return sandboxIntegrationOk;
}

async function skipUnlessSandboxIntegration(t: { skip: (reason?: string) => void }): Promise<boolean> {
  if (!(await ensureSandboxIntegrationProbe())) {
    t.skip('sandbox-exec integration unavailable in this environment');
    return false;
  }
  return true;
}

test('mapSandboxError maps sandbox execution errors', () => {
  assert.equal(
    mapSandboxError(new SandboxExecutionError('mem', 'sandbox-memory-exceeded')),
    'sandbox-memory-exceeded',
  );
  assert.equal(mapSandboxError(new Error('code-runner-timeout')), 'code-runner-timeout');
  assert.equal(mapSandboxError(new Error('other')), undefined);
});

test(
  'runInSandbox returns stdout and exitCode 0 on success',
  { skip: isWindows },
  async (t) => {
    if (!(await skipUnlessSandboxIntegration(t))) return;
    const result = await runInSandbox('echo hello', cwd, { networkAllowed: true });
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /hello/);
    assert.equal(result.memoryExceeded, false);
    assert.equal(result.blockedNetworkAttempts, 0);
  },
);

test(
  'runInSandbox streams stdout chunks (no streaming loss in sandbox mode)',
  { skip: isWindows },
  async (t) => {
    if (!(await skipUnlessSandboxIntegration(t))) return;
    const chunks: string[] = [];
    const result = await runInSandbox('echo streamed', cwd, {
      networkAllowed: true,
      onStdoutChunk: (t) => chunks.push(t),
    });
    assert.equal(result.exitCode, 0);
    assert.match(chunks.join(''), /streamed/);
  },
);

test(
  'runInSandbox maps non-zero exit codes without throwing',
  { skip: isWindows },
  async (t) => {
    if (!(await skipUnlessSandboxIntegration(t))) return;
    const result = await runInSandbox('exit 3', cwd, { networkAllowed: true });
    assert.equal(result.exitCode, 3);
  },
);

test('runInSandbox throws timeout error type', { skip: isWindows }, async (t) => {
  if (!(await skipUnlessSandboxIntegration(t))) return;
  await assert.rejects(
    () => runInSandbox('sleep 2', cwd, { networkAllowed: true, timeoutSeconds: 0.3 }),
    (e: unknown) =>
      e instanceof SandboxExecutionError && e.errorType === 'code-runner-timeout',
  );
});

test(
  'runInSandbox throws sandbox-network-blocked when a blocked attempt fails the command',
  { skip: isWindows },
  async (t) => {
    if (!(await skipUnlessSandboxIntegration(t))) return;
    await assert.rejects(
      () =>
        runInSandbox('echo "getaddrinfo ENOTFOUND example.com" 1>&2; exit 1', cwd, {
          networkAllowed: false,
        }),
      (e: unknown) =>
        e instanceof SandboxExecutionError && e.errorType === 'sandbox-network-blocked',
    );
  },
);

test(
  'runInSandbox does not flag network-blocked when the command still succeeds',
  { skip: isWindows },
  async (t) => {
    if (!(await skipUnlessSandboxIntegration(t))) return;
    const result = await runInSandbox(
      'echo "getaddrinfo ENOTFOUND example.com" 1>&2; exit 0',
      cwd,
      { networkAllowed: false },
    );
    assert.equal(result.exitCode, 0);
    assert.equal(result.blockedNetworkAttempts, 1);
  },
);

test(
  'runInSandbox sets proxy env vars when network is disallowed',
  { skip: isWindows },
  async (t) => {
    if (!(await skipUnlessSandboxIntegration(t))) return;
    const result = await runInSandbox('echo $HTTPS_PROXY', cwd, { networkAllowed: false });
    assert.match(result.stdout, /127\.0\.0\.1:9/);
  },
);

test(
  'runInSandbox leaves proxy env untouched when network is allowed',
  { skip: isWindows },
  async (t) => {
    if (!(await skipUnlessSandboxIntegration(t))) return;
    const result = await runInSandbox('echo "[$STAGENT_SANDBOX_NETWORK]"', cwd, {
      networkAllowed: true,
    });
    assert.match(result.stdout, /\[\]/);
  },
);

test('buildMacosSandboxProfile confines writes and blocks network when disallowed', () => {
  const profile = buildMacosSandboxProfile({
    writeRoots: ['/work/project', '/private/var/folders/x'],
    networkAllowed: false,
  });
  assert.match(profile, /^\(version 1\)/);
  assert.match(profile, /\(allow default\)/);
  assert.match(profile, /\(deny file-write\*\)/);
  assert.match(profile, /\(subpath "\/work\/project"\)/);
  assert.match(profile, /\(subpath "\/private\/var\/folders\/x"\)/);
  assert.match(profile, /\(deny network\*\)/);
});

test('buildMacosSandboxProfile keeps network when allowed', () => {
  const profile = buildMacosSandboxProfile({ writeRoots: ['/w'], networkAllowed: true });
  assert.doesNotMatch(profile, /\(deny network\*\)/);
});

test('sbplStringLiteral escapes backslashes and quotes', () => {
  assert.equal(sbplStringLiteral('/a/b'), '"/a/b"');
  assert.equal(sbplStringLiteral('a"b\\c'), '"a\\"b\\\\c"');
});

test(
  'runInSandbox (macOS) allows writes inside the working directory',
  { skip: !isDarwin },
  async (t) => {
    if (!(await skipUnlessSandboxIntegration(t))) return;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sbx-inside-'));
    try {
      const result = await runInSandbox('echo hi > inside.txt', dir, { networkAllowed: true });
      assert.equal(result.exitCode, 0);
      assert.equal(fs.existsSync(path.join(dir, 'inside.txt')), true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
);

test(
  'runInSandbox (macOS) blocks writes outside the working directory',
  { skip: !isDarwin },
  async (t) => {
    if (!(await skipUnlessSandboxIntegration(t))) return;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sbx-outside-'));
    const probe = path.join(os.tmpdir(), `stagent_sbx_probe_${process.pid}_${Date.now()}`);
    try {
      const result = await runInSandbox(`echo hi > ${JSON.stringify(probe)}`, dir, {
        networkAllowed: true,
      });
      assert.notEqual(result.exitCode, 0);
      assert.equal(fs.existsSync(probe), false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(probe, { force: true });
    }
  },
);

test(
  'runInSandbox (macOS) blocks deleting files outside the working directory',
  { skip: !isDarwin },
  async (t) => {
    if (!(await skipUnlessSandboxIntegration(t))) return;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sbx-rm-'));
    const victimDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stagent_sbx_victim_'));
    const victim = path.join(victimDir, 'keep.txt');
    fs.writeFileSync(victim, 'precious');
    try {
      const result = await runInSandbox(`rm -f ${JSON.stringify(victim)}`, dir, {
        networkAllowed: true,
      });
      assert.notEqual(result.exitCode, 0);
      assert.equal(fs.existsSync(victim), true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(victimDir, { recursive: true, force: true });
    }
  },
);
