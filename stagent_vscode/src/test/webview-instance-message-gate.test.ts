import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { shouldAcceptBackendMessage } from '../webview/runtime/backendMessageInstanceGate';
import { sessionStore } from '../webview/runtime/stores';

function setActive(key: string | null): void {
  sessionStore.sessionId = key;
  sessionStore.activeInstanceKey = key;
  sessionStore.draftInstanceKey = key;
}

test('shouldAcceptBackendMessage: rejects execution message for wrong instanceKey', () => {
  setActive('inst-b');
  assert.equal(
    shouldAcceptBackendMessage({
      type: 'stageStatusUpdate',
      stageId: 's1',
      status: 'running',
      instanceKey: 'inst-a',
    }),
    false,
  );
});

test('shouldAcceptBackendMessage: accepts matching instanceKey', () => {
  setActive('inst-b');
  assert.equal(
    shouldAcceptBackendMessage({
      type: 'stageOutputUpdate',
      stageId: 's1',
      outputKey: 'out',
      content: 'x',
      instanceKey: 'inst-b',
    }),
    true,
  );
});

test('shouldAcceptBackendMessage: high-seq wrong instance still rejected', () => {
  setActive('inst-new');
  assert.equal(
    shouldAcceptBackendMessage({
      type: 'streamChunk',
      stageId: 's1',
      chunk: 'late',
      seq: 9999,
      instanceKey: 'inst-old',
    }),
    false,
  );
});

test('shouldAcceptBackendMessage: instanceResumed always accepted to bind session', () => {
  setActive('inst-old');
  assert.equal(
    shouldAcceptBackendMessage({
      type: 'instanceResumed',
      instanceKey: 'inst-new',
      workflow: { stages: [] } as never,
      instanceStatus: 'running',
    }),
    true,
  );
});

test('shouldAcceptBackendMessage: generationProgress passes without instanceKey while active set', () => {
  setActive('inst-draft');
  assert.equal(shouldAcceptBackendMessage({ type: 'generationProgress', operation: 'workflow', phase: 'llm', message: '…' }), true);
});

test('shouldAcceptBackendMessage: rejects foreign instanceKey once active session bound', () => {
  setActive('inst-b');
  assert.equal(
    shouldAcceptBackendMessage({
      type: 'dagWaveUpdate',
      waveIndex: 0,
      activeStageIds: ['s1'],
      phase: 'start',
      instanceKey: 'inst-a',
    }),
    false,
  );
});
