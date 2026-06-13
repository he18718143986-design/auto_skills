import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import type { Stage } from '../WorkflowDefinition';
import {
  lintTestRunPreflightOnDisk,
  stageNeedsPythonTestRunPreflight,
  stageNeedsTestRunPreflight,
} from '../TestRunPreflight';

function testRunStage(command: string): Stage {
  return {
    id: 'stage_test_run_market_connector',
    title: 'run tests',
    tool: 'code-runner',
    toolConfig: { type: 'code-runner', command, captureOutput: true },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'out', format: 'text' }],
    pauseAfter: false,
  };
}

function withTempDir(fn: (dir: string) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stagent-py-preflight-'));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('stageNeedsPythonTestRunPreflight: pytest yes', () => {
  assert.equal(stageNeedsPythonTestRunPreflight(testRunStage('.venv/bin/pytest tests/ -v')), true);
  assert.equal(stageNeedsTestRunPreflight(testRunStage('pytest -q')), true);
});

test('python preflight: missing venv blocks', () => {
  withTempDir((dir) => {
    fs.mkdirSync(path.join(dir, 'tests'));
    fs.writeFileSync(path.join(dir, 'tests', 'test_foo.py'), 'from foo import Bar\n');
    const issue = lintTestRunPreflightOnDisk({
      workspaceRoot: dir,
      cwd: dir,
      stage: testRunStage('.venv/bin/pytest tests/test_foo.py -v'),
    });
    assert.ok(issue);
    assert.equal(issue!.code, 'missing-python-venv');
  });
});

test('python preflight: auto-fix conftest for flat layout', () => {
  withTempDir((dir) => {
    fs.mkdirSync(path.join(dir, '.venv', 'bin'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.venv', 'bin', 'python'), '#!/bin/sh\n');
    fs.mkdirSync(path.join(dir, 'tests'));
    fs.writeFileSync(path.join(dir, 'tests', 'test_foo.py'), 'from foo import Bar\n');
    const issue = lintTestRunPreflightOnDisk({
      workspaceRoot: dir,
      cwd: dir,
      stage: testRunStage('.venv/bin/pytest tests/test_foo.py -v'),
    });
    assert.equal(issue, null);
    assert.ok(fs.existsSync(path.join(dir, 'conftest.py')));
  });
});

test('python preflight: missing pytest-asyncio blocks async tests', () => {
  withTempDir((dir) => {
    fs.mkdirSync(path.join(dir, '.venv', 'bin'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.venv', 'bin', 'python'), '#!/bin/sh\n');
    fs.mkdirSync(path.join(dir, '.venv', 'lib', 'python3.9', 'site-packages'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'tests'));
    fs.writeFileSync(path.join(dir, 'conftest.py'), 'import sys\nsys.path.insert(0, ".")\n');
    fs.writeFileSync(
      path.join(dir, 'tests', 'test_async.py'),
      'import pytest\n\n@pytest.mark.asyncio\nasync def test_ping():\n    assert True\n',
    );
    const issue = lintTestRunPreflightOnDisk({
      workspaceRoot: dir,
      cwd: dir,
      stage: testRunStage('.venv/bin/pytest tests/test_async.py -v'),
    });
    assert.ok(issue);
    assert.equal(issue!.code, 'missing-pytest-asyncio');
  });
});
