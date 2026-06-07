import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  commandNeedsNetworkAccess,
  DEFAULT_CODE_RUNNER_TIMEOUT_SEC,
  DEPENDENCY_INSTALL_TIMEOUT_SEC,
  HEAVY_PYTHON_IMPORT_MIN_TIMEOUT_SEC,
  normalizeCodeRunnerTimeoutsForWorkflow,
  resolveCodeRunnerTimeoutSeconds,
  resolveSandboxNetworkAllowed,
} from '../CodeRunnerInvokeHelpers';
import type { WorkflowDefinition } from '../WorkflowDefinition';

test('commandNeedsNetworkAccess detects package managers', () => {
  assert.equal(commandNeedsNetworkAccess('cd apps/server && npm install'), true);
  assert.equal(commandNeedsNetworkAccess('npm ci'), true);
  assert.equal(commandNeedsNetworkAccess('.venv/bin/python -m pip install -r requirements.txt'), true);
  assert.equal(commandNeedsNetworkAccess('npm init -y'), false);
  assert.equal(commandNeedsNetworkAccess('npm test'), false);
  assert.equal(commandNeedsNetworkAccess('npx tsc -p tsconfig.json'), false);
});

test('resolveCodeRunnerTimeoutSeconds applies install floor and respects higher explicit', () => {
  assert.equal(
    resolveCodeRunnerTimeoutSeconds('npm install'),
    DEPENDENCY_INSTALL_TIMEOUT_SEC,
  );
  assert.equal(
    resolveCodeRunnerTimeoutSeconds('npm install', 120),
    DEPENDENCY_INSTALL_TIMEOUT_SEC,
  );
  assert.equal(resolveCodeRunnerTimeoutSeconds('npm install', 600), 600);
  assert.equal(resolveCodeRunnerTimeoutSeconds('npm test'), DEFAULT_CODE_RUNNER_TIMEOUT_SEC);
  assert.equal(
    resolveCodeRunnerTimeoutSeconds(
      '.venv/bin/python -c "import pandas"',
    ),
    HEAVY_PYTHON_IMPORT_MIN_TIMEOUT_SEC,
  );
});

test('resolveSandboxNetworkAllowed matches install commands', () => {
  assert.equal(resolveSandboxNetworkAllowed('pnpm install'), true);
  assert.equal(resolveSandboxNetworkAllowed('npm run test'), false);
});

test('normalizeCodeRunnerTimeoutsForWorkflow strips unnecessary timeout fields', () => {
  const wf: WorkflowDefinition = {
    id: 'wf_t',
    version: '2.0',
    meta: { title: 't', taskType: 'software', userInput: 'u', createdAt: new Date().toISOString() },
    stages: [
      {
        id: 'stage_env_server_install',
        title: 'install',
        tool: 'code-runner',
        toolConfig: {
          type: 'code-runner',
          command: 'cd apps/server && npm install',
          captureOutput: true,
          timeout: 120,
        },
        input: { sources: [], mergeStrategy: 'concat' },
        outputs: [{ key: 'log', format: 'text' }],
        pauseAfter: false,
      },
      {
        id: 'stage_test_run_x',
        title: 'test',
        tool: 'code-runner',
        toolConfig: {
          type: 'code-runner',
          command: 'npm test',
          captureOutput: true,
          timeout: 90,
        },
        input: { sources: [], mergeStrategy: 'concat' },
        outputs: [{ key: 'log', format: 'text' }],
        pauseAfter: false,
      },
      {
        id: 'stage_custom_long',
        title: 'long',
        tool: 'code-runner',
        toolConfig: {
          type: 'code-runner',
          command: 'npm install',
          captureOutput: true,
          timeout: 600,
        },
        input: { sources: [], mergeStrategy: 'concat' },
        outputs: [{ key: 'log', format: 'text' }],
        pauseAfter: false,
      },
    ],
  };
  normalizeCodeRunnerTimeoutsForWorkflow(wf);
  const install = wf.stages[0].toolConfig as { timeout?: number };
  const test = wf.stages[1].toolConfig as { timeout?: number };
  const long = wf.stages[2].toolConfig as { timeout?: number };
  assert.equal(install.timeout, undefined);
  assert.equal(test.timeout, undefined);
  assert.equal(long.timeout, 600);
});
