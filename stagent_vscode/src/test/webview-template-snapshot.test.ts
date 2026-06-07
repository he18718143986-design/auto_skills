import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildWorkflowWebviewHtml } from '../WebviewPanel';
import {
  extractHtmlElementIds,
  loadWebviewTemplate,
  normalizeWebviewHtmlForSnapshot,
  renderWebviewTemplate,
} from '../WebviewTemplateLoader';

const FIXTURES = path.join(__dirname, '..', '..', 'src', 'test', 'fixtures', 'webview');

function readIdSnapshot(name: string): string[] {
  const file = path.join(FIXTURES, `${name}-element-ids.json`);
  return JSON.parse(fs.readFileSync(file, 'utf8')) as string[];
}

function assertIdSnapshot(templateName: string, snapshotBase: string): void {
  const ids = extractHtmlElementIds(loadWebviewTemplate(templateName));
  assert.deepEqual(ids, readIdSnapshot(snapshotBase));
}

test('main-panel template DOM id snapshot', () => {
  assertIdSnapshot('main-panel.html', 'main-panel');
});

test('ai-controls template DOM id snapshot', () => {
  assertIdSnapshot('ai-controls.html', 'ai-controls');
});

test('task-list template DOM id snapshot', () => {
  assertIdSnapshot('task-list.html', 'task-list');
});

test('buildWorkflowWebviewHtml renders template with stable structure', () => {
  const html = buildWorkflowWebviewHtml({ cspSource: 'vscode-test://webview' } as never);
  const normalized = normalizeWebviewHtmlForSnapshot(html);
  assert.match(normalized, /id="view-input"/);
  assert.match(normalized, /id="view-confirm"/);
  assert.match(normalized, /id="view-exec"/);
  assert.match(normalized, /id="plan-stage-cards"/);
  assert.match(normalized, /window\.__stagentL10n=__L10N__;/);
  assert.match(normalized, /<script nonce="__NONCE__">\/\* bundle \*\/<\/script>/);
  assert.doesNotMatch(normalized, /\{\{[A-Z_]+\}\}/);
});

test('renderWebviewTemplate rejects unresolved placeholders', () => {
  assert.throws(
    () =>
      renderWebviewTemplate('main-panel.html', {
        CSP: 'x',
        NONCE: 'n',
        STYLES: 's',
        L10N_JSON: '{}',
      }),
    /unresolved placeholders.*SCRIPT/,
  );
});
