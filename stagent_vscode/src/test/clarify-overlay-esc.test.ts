import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { setupWebviewScriptRuntime } from './webview-script-test-harness';

test('clarify overlay: Escape cancels without generateWorkflow', () => {
  const rt = setupWebviewScriptRuntime(true);
  rt.document.getElementById('task-workspace-path')!.value = '/tmp/ws';
  rt.document.getElementById('user-input')!.value = '做一个 API';
  rt.document.getElementById('btn-gen')!.onclick?.();
  rt.send({
    type: 'clarifyQuestions',
    questions: [{ id: 'q1', text: '部署环境？', required: true }],
  });

  assert.ok(rt.document.getElementById('clarify-overlay'));
  const genBefore = rt.postMessages.filter((m) => (m as { type?: string }).type === 'generateWorkflow').length;

  rt.dispatchKeydown('Escape');

  assert.equal(rt.document.getElementById('clarify-overlay'), null);
  const genAfter = rt.postMessages.filter((m) => (m as { type?: string }).type === 'generateWorkflow').length;
  assert.equal(genAfter, genBefore);
  assert.equal(rt.document.getElementById('btn-gen')!.disabled, false);
});
