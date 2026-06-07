import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { enrichBackendMessageInstanceKey } from '../BackendMessageEnrichment';
import type { MessagingHost } from '../WorkflowEngineMessaging';
import type { BackendMessage } from '../WorkflowDefinition';

function mockHost(instanceKey: string | undefined): MessagingHost {
  return {
    getInstance: () => undefined,
    getCurrentInstanceKey: () => instanceKey,
    getGlobalStorageFsPath: () => '/tmp',
    getExperiencePersistedForKey: () => undefined,
    setExperiencePersistedForKey: () => {},
    warn: () => {},
    debugLog: () => {},
    logUserAction: () => {},
  };
}

test('enrichBackendMessageInstanceKey injects host key when message has none', () => {
  const out = enrichBackendMessageInstanceKey(mockHost('inst-run-1'), {
    type: 'stageStatusUpdate',
    stageId: 's1',
    status: 'running',
  });
  assert.equal(out.instanceKey, 'inst-run-1');
  assert.equal(out.sessionId, 'inst-run-1');
});

test('enrichBackendMessageInstanceKey preserves explicit instanceKey on message', () => {
  const out = enrichBackendMessageInstanceKey(mockHost('inst-host'), {
    type: 'instanceResumed',
    instanceKey: 'inst-resumed',
    workflow: { stages: [] } as never,
    instanceStatus: 'running',
  });
  assert.equal(out.instanceKey, 'inst-resumed');
  assert.equal(out.sessionId, 'inst-resumed');
});

test('enrichBackendMessageInstanceKey leaves message unchanged when host has no key', () => {
  const msg: BackendMessage = { type: 'clarifyQuestions', questions: [] };
  const out = enrichBackendMessageInstanceKey(mockHost(undefined), msg);
  assert.equal(out.instanceKey, undefined);
});
