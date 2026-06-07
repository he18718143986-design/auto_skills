import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  StagentError,
  classifyThrownError,
  codeRunnerTimeout,
  fileNotFound,
  implHollowOutput,
  invariantViolation,
  llmContextOverflow,
  normalizeErrorType,
  stageNotFound,
  toolExecutionFailed,
} from '../ErrorTypeUtils';

test('normalizeErrorType accepts new M17 types and falls back', () => {
  assert.equal(normalizeErrorType('confidence-too-low'), 'confidence-too-low');
  assert.equal(normalizeErrorType('sandbox-network-blocked'), 'sandbox-network-blocked');
  assert.equal(normalizeErrorType('not-a-real-type'), 'unknown');
});

test('#11 StagentError carries explicit errorType and preserves message format', () => {
  assert.equal(invariantViolation('boom').message, 'invariant-violation:boom');
  assert.equal(fileNotFound('/a/b.py').message, 'file-not-found:/a/b.py');
  assert.equal(stageNotFound('stage_x').message, 'stage-not-found:stage_x');
  assert.equal(stageNotFound(undefined).message, 'stage-not-found:');
  assert.equal(codeRunnerTimeout().message, 'code-runner-timeout');
  assert.equal(toolExecutionFailed('exitCode=1').message, 'tool-execution-failed: exitCode=1');
  assert.ok(fileNotFound('x') instanceof StagentError);
  assert.ok(fileNotFound('x') instanceof Error);
  assert.equal(fileNotFound('x').errorType, 'file-not-found');
});

test('#11 classifyThrownError prefers StagentError.errorType over message text', () => {
  // 显式类型即便 message 措辞变化也稳定
  const reworded = new StagentError('file-not-found', '文件没找到：/a/b（措辞已改）');
  assert.equal(classifyThrownError(reworded), 'file-not-found');
  assert.equal(classifyThrownError(invariantViolation('x')), 'invariant-violation');
  assert.equal(classifyThrownError(codeRunnerTimeout()), 'code-runner-timeout');
  // Sandbox errors thrown by WorkflowCodeRunnerHost as StagentError classify by type, not the
  // raw "sandbox-error:" message prefix.
  assert.equal(
    classifyThrownError(new StagentError('sandbox-network-blocked', 'sandbox-error:sandbox-network-blocked')),
    'sandbox-network-blocked',
  );
  assert.equal(
    classifyThrownError(new StagentError('sandbox-memory-exceeded', 'sandbox-error:sandbox-memory-exceeded')),
    'sandbox-memory-exceeded',
  );
});

test('#11 classifyThrownError uses minimal fallback for non-StagentError', () => {
  assert.equal(classifyThrownError(new Error('code-runner-timeout')), 'code-runner-timeout');
  assert.equal(classifyThrownError(new Error('file-not-found:/p')), 'tool-execution-failed');
  assert.equal(classifyThrownError(new Error('impl-hollow-output(2)')), 'tool-execution-failed');
  assert.equal(classifyThrownError(implHollowOutput()), 'llm-invalid-output');
  assert.equal(classifyThrownError(llmContextOverflow()), 'llm-context-overflow');
  assert.equal(classifyThrownError(new Error('something else')), 'tool-execution-failed');
  assert.equal(classifyThrownError(new Error('boom'), true), 'llm-timeout');
});
