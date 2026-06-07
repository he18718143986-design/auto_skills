import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { shouldUseEngineInstanceDespiteStaleWebviewKey } from '../WorkflowInstanceBind';

test('stale webview key ignored while engine instance is running', () => {
  assert.equal(
    shouldUseEngineInstanceDespiteStaleWebviewKey('engine-key', 'draft-key', 'running', 0),
    true,
  );
});

test('stale webview key ignored during nested execution', () => {
  assert.equal(
    shouldUseEngineInstanceDespiteStaleWebviewKey('engine-key', 'draft-key', 'idle', 1),
    true,
  );
});

test('matching keys do not trigger stale override', () => {
  assert.equal(
    shouldUseEngineInstanceDespiteStaleWebviewKey('same-key', 'same-key', 'running', 0),
    false,
  );
});

test('idle without execution depth does not override stale key', () => {
  assert.equal(
    shouldUseEngineInstanceDespiteStaleWebviewKey('engine-key', 'draft-key', 'idle', 0),
    false,
  );
});
