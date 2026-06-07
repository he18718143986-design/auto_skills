import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  detectMissingCommand,
  formatToolExecutionFailedCopy,
  inferToolFromStageId,
  parseCodeRunnerExitCode,
} from '../errors/catalog/toolExecutionCopy';

describe('toolExecutionCopy', () => {
  it('parseCodeRunnerExitCode reads exit code from error text', () => {
    assert.equal(parseCodeRunnerExitCode('tool-execution-failed: code-runner exitCode=127'), 127);
    assert.equal(parseCodeRunnerExitCode('tool-execution-failed: code-runner exitCode=1'), 1);
    assert.equal(parseCodeRunnerExitCode('other'), undefined);
  });

  it('detectMissingCommand parses command not found stderr', () => {
    assert.equal(detectMissingCommand('sh: flutter: command not found'), 'flutter');
    assert.equal(detectMissingCommand('env: npm: No such file or directory'), 'npm');
  });

  it('inferToolFromStageId uses stage id hints', () => {
    assert.equal(inferToolFromStageId('stage_test_run_chat_ui'), 'flutter');
    assert.equal(inferToolFromStageId('stage_init_npm_workspace'), 'npm');
  });

  it('formatToolExecutionFailedCopy branches 127 to environment copy', () => {
    const copy = formatToolExecutionFailedCopy({
      rawError: 'tool-execution-failed: code-runner exitCode=127',
      stderr: 'sh: flutter: command not found',
      stageId: 'stage_test_run_chat_ui',
    });
    assert.equal(copy.exitCode, 127);
    assert.equal(copy.userCategory, 'environment');
    assert.equal(copy.weakenRetry, true);
    assert.match(copy.title, /flutter/i);
    assert.ok(copy.playbookSteps.length >= 3);
  });

  it('formatToolExecutionFailedCopy branches 1 to code copy', () => {
    const copy = formatToolExecutionFailedCopy({
      rawError: 'tool-execution-failed: code-runner exitCode=1',
      stderr: 'FAIL tests',
      stageId: 'stage_test_run_chat_integration',
    });
    assert.equal(copy.exitCode, 1);
    assert.equal(copy.userCategory, 'code');
    assert.equal(copy.weakenRetry, false);
    assert.match(copy.title, /pass|通过/i);
  });
});
