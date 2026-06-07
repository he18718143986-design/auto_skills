import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import type { Stage } from '../WorkflowDefinition';
import {
  diskSignalsExpoStack,
  lintTestRunPreflightOnDisk,
  resolveTestRunPreflightCwd,
  scanTestInfraOnDisk,
  stageNeedsTestRunPreflight,
} from '../TestRunPreflight';

function testRunStage(command: string, id = 'stage_test_run_unit'): Stage {
  return {
    id,
    title: 'run tests',
    tool: 'code-runner',
    toolConfig: { type: 'code-runner', command, captureOutput: true },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'out', format: 'text' }],
    pauseAfter: false,
  };
}

function withTempDir(fn: (dir: string) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stagent-preflight-'));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('stageNeedsTestRunPreflight: jest stage yes, pytest stage no', () => {
  assert.equal(stageNeedsTestRunPreflight(testRunStage('npx jest')), true);
  assert.equal(stageNeedsTestRunPreflight(testRunStage('pytest -q')), false);
  assert.equal(
    stageNeedsTestRunPreflight({
      ...testRunStage('npm test'),
      id: 'stage_impl_foo',
    }),
    false,
  );
});

test('M38.1: missing jest/babel/tsconfig on disk blocks', () => {
  withTempDir((dir) => {
    const issue = lintTestRunPreflightOnDisk({
      workspaceRoot: dir,
      cwd: dir,
      stage: testRunStage('npm test'),
    });
    assert.ok(issue);
    assert.equal(issue!.code, 'missing-test-infrastructure');
    assert.match(issue!.message, /M38\.1/);
  });
});

test('M38.1: jest.config.js on disk passes (non-expo)', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'jest.config.js'), 'module.exports = {};');
    const issue = lintTestRunPreflightOnDisk({
      workspaceRoot: dir,
      cwd: dir,
      stage: testRunStage('npx jest'),
    });
    assert.equal(issue, null);
  });
});

test('M38.1: tsconfig.json on disk passes (non-expo)', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), '{}');
    const issue = lintTestRunPreflightOnDisk({
      workspaceRoot: dir,
      cwd: dir,
      stage: testRunStage('npm test'),
    });
    assert.equal(issue, null);
  });
});

test('M38.1: Expo App.tsx requires jest and babel on disk', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'App.tsx'), 'export default function App() {}');
    let issue = lintTestRunPreflightOnDisk({
      workspaceRoot: dir,
      cwd: dir,
      stage: testRunStage('npx jest'),
    });
    assert.ok(issue);
    assert.equal(issue!.code, 'missing-test-infrastructure');

    fs.writeFileSync(path.join(dir, 'jest.config.js'), "module.exports = { preset: 'jest-expo' };");
    issue = lintTestRunPreflightOnDisk({
      workspaceRoot: dir,
      cwd: dir,
      stage: testRunStage('npx jest'),
    });
    assert.ok(issue);
    assert.equal(issue!.code, 'missing-babel-config');

    fs.writeFileSync(path.join(dir, 'babel.config.js'), "module.exports = { presets: ['babel-preset-expo'] };");
    issue = lintTestRunPreflightOnDisk({
      workspaceRoot: dir,
      cwd: dir,
      stage: testRunStage('npx jest'),
    });
    assert.equal(issue, null);
  });
});

test('M38.1: jest.config under cd target passes when command uses cd server', () => {
  withTempDir((dir) => {
    const server = path.join(dir, 'server');
    fs.mkdirSync(server, { recursive: true });
    fs.writeFileSync(path.join(server, 'jest.config.js'), 'module.exports = {};');
    const issue = lintTestRunPreflightOnDisk({
      workspaceRoot: dir,
      cwd: dir,
      stage: testRunStage('cd server && npm test -- chat_integration', 'stage_test_run_chat_integration'),
    });
    assert.equal(issue, null);
    assert.equal(
      resolveTestRunPreflightCwd({
        workspaceRoot: dir,
        codeRunnerCwd: dir,
        command: 'cd server && npm test',
      }),
      server,
    );
  });
});

test('M38.1: jest only under server/ without cd fails with diagnostic paths', () => {
  withTempDir((dir) => {
    const server = path.join(dir, 'server');
    fs.mkdirSync(server, { recursive: true });
    fs.writeFileSync(path.join(server, 'jest.config.js'), 'module.exports = {};');
    const issue = lintTestRunPreflightOnDisk({
      workspaceRoot: dir,
      cwd: dir,
      stage: testRunStage('npm test'),
    });
    assert.ok(issue);
    assert.match(issue!.message, /checked:/);
    assert.match(issue!.message, /server\/jest\.config\.js/);
    assert.match(issue!.message, /not in effective cwd/);
  });
});

test('scanTestInfraOnDisk merges cwd and workspaceRoot', () => {
  withTempDir((root) => {
    const sub = path.join(root, 'pkg');
    fs.mkdirSync(sub);
    fs.writeFileSync(path.join(root, 'jest.config.js'), 'module.exports = {};');
    const infra = scanTestInfraOnDisk(root, sub);
    assert.equal(infra.jest, true);
  });
});

test('diskSignalsExpoStack: package.json expo dependency', () => {
  withTempDir((dir) => {
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ dependencies: { expo: '51.0.0' } }),
    );
    assert.equal(diskSignalsExpoStack(dir, dir), true);
  });
});
