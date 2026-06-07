import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { isBackendMessage, isFrontendMessage } from '../WebviewMessageGuards';

test('isBackendMessage accepts known backend types', () => {
  assert.equal(isBackendMessage({ type: 'workflowGenerated', workflow: {} }), true);
  assert.equal(isBackendMessage({ type: 'stageError', stageId: 's1', error: 'x' }), true);
});

test('isBackendMessage rejects unknown types', () => {
  assert.equal(isBackendMessage({ type: 'notARealMessage' }), false);
  assert.equal(isBackendMessage(null), false);
});

test('isFrontendMessage accepts any object with type string', () => {
  assert.equal(isFrontendMessage({ type: 'generateWorkflow' }), true);
  assert.equal(isFrontendMessage({ type: 'unknown' }), true);
});
