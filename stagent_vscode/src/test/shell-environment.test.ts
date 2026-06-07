import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  captureLoginShellEnvSync,
  defaultLoginShell,
  getMergedExecEnv,
  parseEnvStdout,
  resetShellEnvironmentCache,
} from '../process/shellEnvironment';

test('parseEnvStdout parses KEY=value lines and skips noise', () => {
  const env = parseEnvStdout('welcome\nPATH=/a/b\nbad-key=skip\nFOO=bar\n');
  assert.equal(env.PATH, '/a/b');
  assert.equal(env.FOO, 'bar');
  assert.equal(env['bad-key'], undefined);
});

test('defaultLoginShell prefers override then SHELL', () => {
  const prev = process.env.SHELL;
  process.env.SHELL = '/bin/zsh';
  try {
    assert.equal(defaultLoginShell('/custom/sh'), '/custom/sh');
    assert.equal(defaultLoginShell(), '/bin/zsh');
  } finally {
    if (prev === undefined) {
      delete process.env.SHELL;
    } else {
      process.env.SHELL = prev;
    }
  }
});

test('getMergedExecEnv prefers login-shell PATH when capture succeeds', () => {
  resetShellEnvironmentCache();
  const merged = getMergedExecEnv();
  assert.ok(merged.PATH);
  const login = captureLoginShellEnvSync();
  if (login.PATH) {
    assert.equal(merged.PATH, login.PATH);
  }
});

test('resetShellEnvironmentCache allows re-capture', () => {
  resetShellEnvironmentCache();
  const first = captureLoginShellEnvSync();
  resetShellEnvironmentCache();
  const second = captureLoginShellEnvSync();
  assert.deepEqual(Object.keys(second).sort(), Object.keys(first).sort());
});
