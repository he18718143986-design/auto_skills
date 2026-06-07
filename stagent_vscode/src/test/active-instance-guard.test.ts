import './install-vscode-stub';
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { canSwitchActiveInstance } from '../ActiveInstanceGuard';
import {
  canSwitchToSession,
  createInstanceSession,
  resolveSessionForAction,
} from '../InstanceSession';
import { tryActivateInstance, type ResumeCoordinatorHost } from '../WorkflowInstanceResumeCoordinator';
import type { WorkflowInstance } from '../WorkflowDefinition';

test('canSwitchActiveInstance: same key always allowed during execution', () => {
  assert.deepEqual(
    canSwitchActiveInstance({ currentKey: 'a', targetKey: 'a', executionDepth: 3 }),
    { ok: true },
  );
});

test('canSwitchActiveInstance: different key blocked when executionDepth > 0', () => {
  const d = canSwitchActiveInstance({ currentKey: 'a', targetKey: 'b', executionDepth: 1 });
  assert.equal(d.ok, false);
  if (!d.ok) {
    assert.equal(d.code, 'execution-in-flight');
  }
});

test('canSwitchActiveInstance: idle engine allows switch', () => {
  assert.deepEqual(
    canSwitchActiveInstance({ currentKey: 'a', targetKey: 'b', executionDepth: 0 }),
    { ok: true },
  );
});

test('canSwitchToSession delegates to ActiveInstanceGuard', () => {
  assert.deepEqual(
    canSwitchToSession({ currentSessionId: 'x', targetSessionId: 'y', executionDepth: 0 }),
    { ok: true },
  );
});

test('resolveSessionForAction: running engine ignores stale webview session', () => {
  const inst = { status: 'running' } as WorkflowInstance;
  const r = resolveSessionForAction({
    activeSessionId: 'engine-1',
    activeInstance: inst,
    webviewSessionId: 'draft-old',
    executionDepth: 0,
  });
  assert.equal(r.kind, 'stale-webview-ignored');
  assert.equal(r.sessionId, 'engine-1');
});

test('resolveSessionForAction: executionDepth alone ignores stale webview session', () => {
  const inst = { status: 'idle' } as WorkflowInstance;
  const r = resolveSessionForAction({
    activeSessionId: 'engine-1',
    activeInstance: inst,
    webviewSessionId: 'draft-old',
    executionDepth: 2,
  });
  assert.equal(r.kind, 'stale-webview-ignored');
});

test('resolveSessionForAction: idle without depth uses webview session', () => {
  const inst = { status: 'idle' } as WorkflowInstance;
  const r = resolveSessionForAction({
    activeSessionId: 'engine-1',
    activeInstance: inst,
    webviewSessionId: 'draft-new',
    executionDepth: 0,
  });
  assert.equal(r.kind, 'use-webview');
  assert.equal(r.sessionId, 'draft-new');
});

test('race: tryActivateInstance blocked when execution already in flight', () => {
  const posted: unknown[] = [];
  const host: ResumeCoordinatorHost = {
    bindPanel: () => {},
    loadInstanceByKey: () => undefined,
    postMessage: (_p, msg) => posted.push(msg),
    beginUiResync: () => {},
    getInstance: () => ({ status: 'running' } as WorkflowInstance),
    getCurrentInstanceKey: () => 'active-a',
    setInstance: () => {},
    setCurrentInstanceKey: () => {},
    getExecutionDepth: () => 1,
    clearSaveTimer: () => {},
    persistInstanceSnapshot: () => {},
    clearExperiencePersistedFlag: () => {},
    getDefaultTaskDir: () => '/tmp',
    debugLog: () => {},
    scheduleSave: () => {},
    executeNextStage: async () => {},
    warn: () => {},
  };
  const loaded = { status: 'idle' } as WorkflowInstance;
  const out = tryActivateInstance(host, 'target-b', loaded, {} as never);
  assert.equal(out.ok, false);
  assert.ok(
    posted.some(
      (m) =>
        typeof m === 'object' &&
        m !== null &&
        (m as { type?: string }).type === 'instanceSwitchBlocked',
    ),
  );
});

test('InstanceSession wraps id and instance reference', () => {
  const inst = { status: 'idle' } as WorkflowInstance;
  const session = createInstanceSession('sess-1', inst);
  assert.equal(session.id, 'sess-1');
  assert.strictEqual(session.instance, inst);
});
