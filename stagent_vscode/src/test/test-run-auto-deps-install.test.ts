import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import type { Stage, WorkflowDefinition, WorkflowInstance } from '../WorkflowDefinition';
import {
  buildAutoNpmInstallConfig,
  hasCompletedDepsInstallBefore,
  needsNpmInstallInDir,
  relativeDirFromWorkspace,
  shouldAutoNpmInstallBeforeTestRun,
} from '../TestRunAutoDepsInstall';

function testRunStage(command: string): Stage {
  return {
    id: 'stage_test_run_unit',
    title: 'run tests',
    tool: 'code-runner',
    toolConfig: { type: 'code-runner', command, captureOutput: true },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'out', format: 'text' }],
    pauseAfter: false,
  };
}

function runtime(stageId: string, status: 'pending' | 'done'): WorkflowInstance['stageRuntimes'][number] {
  return { stageId, status, outputs: {}, retryCount: 0 };
}

function instanceWithStages(stages: Stage[], runtimes: WorkflowInstance['stageRuntimes']): WorkflowInstance {
  const wf: WorkflowDefinition = {
    id: 'wf',
    version: '2.0',
    meta: {
      title: 't',
      taskType: 'software',
      userInput: 'x',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    stages,
  };
  return {
    definition: wf,
    status: 'running',
    currentStageIndex: 0,
    stageRuntimes: runtimes,
  };
}

function withTempDir(fn: (dir: string) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stagent-auto-deps-'));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('needsNpmInstallInDir: no package.json → false', () => {
  withTempDir((dir) => {
    assert.equal(needsNpmInstallInDir(dir), false);
  });
});

test('needsNpmInstallInDir: package.json without node_modules → true', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'package.json'), '{}');
    assert.equal(needsNpmInstallInDir(dir), true);
  });
});

test('needsNpmInstallInDir: existing node_modules → false', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'package.json'), '{}');
    fs.mkdirSync(path.join(dir, 'node_modules'));
    assert.equal(needsNpmInstallInDir(dir), false);
  });
});

test('hasCompletedDepsInstallBefore: completed deps stage skips auto install', () => {
  const stages = [
    testRunStage('npm test'),
    testRunStage('npm test'),
  ];
  stages.unshift({
    id: 'stage_deps_install_unit',
    title: 'deps',
    tool: 'code-runner',
    toolConfig: { type: 'code-runner', command: 'npm install', captureOutput: true },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'out', format: 'text' }],
    pauseAfter: false,
  });
  const inst = instanceWithStages(stages, [
    runtime('stage_deps_install_unit', 'done'),
    runtime('stage_test_run_unit', 'pending'),
    runtime('stage_test_run_unit', 'pending'),
  ]);
  assert.equal(hasCompletedDepsInstallBefore(inst, 2), true);
});

test('buildAutoNpmInstallConfig: cd server uses server workingDir', () => {
  withTempDir((dir) => {
    const server = path.join(dir, 'server');
    fs.mkdirSync(server);
    const cfg = buildAutoNpmInstallConfig(dir, server);
    assert.equal(cfg.workingDir, 'server');
    assert.equal(relativeDirFromWorkspace(dir, server), 'server');
  });
});

test('shouldAutoNpmInstallBeforeTestRun: skips when deps stage completed', () => {
  withTempDir((dir) => {
    const server = path.join(dir, 'server');
    fs.mkdirSync(server);
    fs.writeFileSync(path.join(server, 'package.json'), '{}');
    const stages = [
      {
        id: 'stage_deps_install_unit',
        title: 'deps',
        tool: 'code-runner' as const,
        toolConfig: { type: 'code-runner' as const, command: 'npm install', captureOutput: true },
        input: { sources: [], mergeStrategy: 'concat' as const },
        outputs: [{ key: 'out', format: 'text' as const }],
        pauseAfter: false,
      },
      testRunStage('cd server && npm test'),
    ];
    const inst = instanceWithStages(stages, [
      runtime('stage_deps_install_unit', 'done'),
      runtime('stage_test_run_unit', 'pending'),
    ]);
    assert.equal(
      shouldAutoNpmInstallBeforeTestRun({
        stage: stages[1]!,
        instance: inst,
        stageIndex: 1,
        effectiveCwd: server,
      }),
      false,
    );
  });
});
