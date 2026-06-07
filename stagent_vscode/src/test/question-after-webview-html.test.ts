import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'path';
import { buildWorkflowWebviewHtml } from '../WebviewPanel';
import { buildWebviewScript } from '../WebviewScript';

test('webview embeds questionAfter (stageQuestions) handling', () => {
  const html = buildWorkflowWebviewHtml({ cspSource: 'vscode-test' } as never);
  const script = buildWebviewScript();
  assert.match(html, /script-src 'nonce-/);
  assert.match(script, /stageQuestions/);
  assert.match(script, /buildAnswerQuestionsMessage/);
  assert.match(script, /renderAfterQuestionsCard/);
});

test('main webview script bundle exists after compile', () => {
  const mainPath = path.join(__dirname, '..', '..', 'out', 'webview', 'webview-main.js');
  assert.ok(fs.existsSync(mainPath), `missing ${mainPath}; run npm run compile`);
  const bundle = fs.readFileSync(mainPath, 'utf8');
  assert.ok(bundle.includes('stageQuestions'));
});
