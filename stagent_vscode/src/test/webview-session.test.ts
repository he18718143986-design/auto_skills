import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { applySessionFromBackend, getOutboundSessionId } from '../webview/runtime/session';
import { sessionStore } from '../webview/runtime/stores';

test('applySessionFromBackend sets single sessionId pointer', () => {
  sessionStore.sessionId = null;
  sessionStore.draftInstanceKey = null;
  sessionStore.activeInstanceKey = null;
  applySessionFromBackend({ sessionId: 'sess-a' });
  assert.equal(sessionStore.sessionId, 'sess-a');
  assert.equal(sessionStore.draftInstanceKey, 'sess-a');
  assert.equal(sessionStore.activeInstanceKey, 'sess-a');
});

test('applySessionFromBackend accepts legacy instanceKey', () => {
  sessionStore.sessionId = null;
  applySessionFromBackend({ instanceKey: 'legacy-b' });
  assert.equal(sessionStore.sessionId, 'legacy-b');
});

test('getOutboundSessionId prefers sessionId', () => {
  sessionStore.sessionId = 'primary';
  sessionStore.activeInstanceKey = 'legacy-active';
  sessionStore.draftInstanceKey = 'legacy-draft';
  assert.equal(getOutboundSessionId(), 'primary');
});
