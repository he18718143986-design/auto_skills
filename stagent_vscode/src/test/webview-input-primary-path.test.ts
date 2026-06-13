import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { setupWebviewScriptRuntime } from './webview-script-test-harness';

test('primary path: generate is main action; polish tools are collapsed by default', () => {
  const rt = setupWebviewScriptRuntime(true);
  assert.ok(rt.document.getElementById('btn-gen'));
  assert.ok(rt.document.getElementById('btn-toggle-polish-tools'));
  assert.equal(rt.document.getElementById('polish-optional-tools')!.style.display, 'none');
  assert.ok(rt.document.getElementById('input-primary-hint'));
});

test('optional polish tools expand on toggle', () => {
  const rt = setupWebviewScriptRuntime(true);
  rt.document.getElementById('btn-toggle-polish-tools')!.onclick?.();
  assert.equal(rt.document.getElementById('polish-optional-tools')!.style.display, 'block');
  assert.ok(rt.document.getElementById('btn-polish'));
});

test('clear requirement shows direct-generate busy copy', () => {
  const rt = setupWebviewScriptRuntime(true);
  rt.document.getElementById('task-workspace-path')!.value = '/tmp/ws';
  rt.document.getElementById('user-input')!.value =
    '空目录 Python 单文件 greet 函数，pytest 单切片验收，目标是最小可运行交付';
  rt.document.getElementById('btn-gen')!.onclick?.();
  assert.equal(rt.document.getElementById('gen-status-detail')!.textContent, '需求已够清楚，跳过额外澄清');
});
