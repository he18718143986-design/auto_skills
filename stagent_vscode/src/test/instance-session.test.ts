import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  buildSessionSyncedMessage,
  resolveSessionForAction,
  shouldIgnoreStaleWebviewSession,
} from '../InstanceSession';
import type { WorkflowInstance } from '../WorkflowDefinition';

const running = { status: 'running' } as WorkflowInstance;
const idle = { status: 'idle' } as WorkflowInstance;

test('shouldIgnoreStaleWebviewSession matches legacy WorkflowInstanceBind semantics', () => {
  assert.equal(
    shouldIgnoreStaleWebviewSession('engine-key', 'draft-key', 'running', 0),
    true,
  );
  assert.equal(
    shouldIgnoreStaleWebviewSession('engine-key', 'draft-key', 'idle', 1),
    true,
  );
  assert.equal(
    shouldIgnoreStaleWebviewSession('same', 'same', 'running', 0),
    false,
  );
  assert.equal(
    shouldIgnoreStaleWebviewSession('engine-key', 'draft-key', 'idle', 0),
    false,
  );
});

test('resolveSessionForAction: no active session falls back to webview id', () => {
  const r = resolveSessionForAction({
    activeSessionId: undefined,
    activeInstance: undefined,
    webviewSessionId: 'draft-only',
    executionDepth: 0,
  });
  assert.equal(r.kind, 'use-webview');
  assert.equal(r.sessionId, 'draft-only');
});

test('resolveSessionForAction: no keys returns missing', () => {
  const r = resolveSessionForAction({
    activeSessionId: undefined,
    activeInstance: undefined,
    webviewSessionId: undefined,
    executionDepth: 0,
  });
  assert.equal(r.kind, 'missing');
});

test('resolveSessionForAction: matching ids use active', () => {
  const r = resolveSessionForAction({
    activeSessionId: 'k',
    activeInstance: idle,
    webviewSessionId: 'k',
    executionDepth: 0,
  });
  assert.equal(r.kind, 'use-active');
});

test('buildSessionSyncedMessage aliases instanceKey for transitional compat', () => {
  const msg = buildSessionSyncedMessage('uuid-1');
  assert.equal(msg.type, 'sessionSynced');
  assert.equal(msg.sessionId, 'uuid-1');
  assert.equal(msg.instanceKey, 'uuid-1');
});
