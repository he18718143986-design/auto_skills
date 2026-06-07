import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import type { Stage } from '../WorkflowDefinition';
import {
  classifyTestRunFailure,
  formatTestRunFailurePlaybookMessage,
  isTestRunFailurePlaybookCandidate,
  resolveTestRunStageErrorMessage,
} from '../TestRunFailurePlaybook';

const JEST_TS_STDERR = `
FAIL src/auth.test.ts
  ● Test suite failed to run
    SyntaxError: Unexpected token export
      at Object.<anonymous> (src/auth.test.ts:3:1)
`;

test('M38.3: jest unexpected token + .ts → jest-ts-transform-missing', () => {
  const pb = classifyTestRunFailure({
    stageId: 'stage_test_run_auth',
    command: 'npx jest --testPathPattern=auth',
    exitCode: 1,
    stdout: '',
    stderr: JEST_TS_STDERR,
  });
  assert.ok(pb);
  assert.equal(pb!.code, 'jest-ts-transform-missing');
  assert.match(formatTestRunFailurePlaybookMessage(pb!), /jest\.config/);
});

test('M38.3: bundled install timeout playbook', () => {
  const pb = classifyTestRunFailure({
    stageId: 'stage_test_run_unit',
    command: 'npm install --silent && npx jest',
    exitCode: -1,
    stdout: '',
    stderr: '',
    timedOut: true,
  });
  assert.equal(pb?.code, 'bundled-install-test-timeout');
});

test('M38.3: jest-expo preset missing', () => {
  const pb = classifyTestRunFailure({
    stageId: 'stage_test_run_app',
    command: 'npx jest',
    exitCode: 1,
    stdout: '',
    stderr: "Cannot find module 'jest-expo' from 'jest.config.js'",
  });
  assert.equal(pb?.code, 'jest-config-or-expo-preset-missing');
});

test('isTestRunFailurePlaybookCandidate: stage_test_run_* yes', () => {
  const stage: Stage = {
    id: 'stage_test_run_a',
    title: 't',
    tool: 'code-runner',
    toolConfig: { type: 'code-runner', command: 'npm test', captureOutput: true },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'out', format: 'text' }],
    pauseAfter: false,
  };
  assert.equal(isTestRunFailurePlaybookCandidate(stage), true);
});

test('resolveTestRunStageErrorMessage replaces bare exitCode message', () => {
  const stage: Stage = {
    id: 'stage_test_run_auth',
    title: 't',
    tool: 'code-runner',
    toolConfig: { type: 'code-runner', command: 'npx jest', captureOutput: true },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'out', format: 'text' }],
    pauseAfter: false,
  };
  const msg = resolveTestRunStageErrorMessage({
    stage,
    errorType: 'tool-execution-failed',
    defaultError: 'tool-execution-failed: code-runner exitCode=1',
    stderr: JEST_TS_STDERR,
    enabled: true,
  });
  assert.match(msg, /M38\.3/);
  assert.match(msg, /jest-ts-transform-missing/);
  assert.doesNotMatch(msg, /exitCode=1/);
});

test('resolveTestRunStageErrorMessage enabled:false keeps default', () => {
  const stage: Stage = {
    id: 'stage_test_run_auth',
    title: 't',
    tool: 'code-runner',
    toolConfig: { type: 'code-runner', command: 'npx jest', captureOutput: true },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'out', format: 'text' }],
    pauseAfter: false,
  };
  const msg = resolveTestRunStageErrorMessage({
    stage,
    errorType: 'tool-execution-failed',
    defaultError: 'tool-execution-failed: code-runner exitCode=1',
    stderr: JEST_TS_STDERR,
    enabled: false,
  });
  assert.equal(msg, 'tool-execution-failed: code-runner exitCode=1');
});

test('non-test stage keeps default error', () => {
  const stage: Stage = {
    id: 'stage_impl_build',
    title: 't',
    tool: 'code-runner',
    toolConfig: { type: 'code-runner', command: 'npm run build', captureOutput: true },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'out', format: 'text' }],
    pauseAfter: false,
  };
  const msg = resolveTestRunStageErrorMessage({
    stage,
    errorType: 'tool-execution-failed',
    defaultError: 'tool-execution-failed: code-runner exitCode=1',
    stderr: JEST_TS_STDERR,
  });
  assert.equal(msg, 'tool-execution-failed: code-runner exitCode=1');
});
