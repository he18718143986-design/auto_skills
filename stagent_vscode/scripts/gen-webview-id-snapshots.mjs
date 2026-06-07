#!/usr/bin/env node
/** 从 src/webview/templates 生成 DOM id 契约 snapshot（供 webview-template-snapshot.test.ts）。 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TPL = path.join(ROOT, 'src/webview/templates');
const OUT = path.join(ROOT, 'src/test/fixtures/webview');

function extractHtmlElementIds(html) {
  const ids = new Set();
  const re = /\bid="([^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    ids.add(m[1]);
  }
  return [...ids].sort();
}

fs.mkdirSync(OUT, { recursive: true });
for (const name of ['main-panel.html', 'ai-controls.html', 'task-list.html']) {
  const html = fs.readFileSync(path.join(TPL, name), 'utf8');
  const ids = extractHtmlElementIds(html);
  const base = name.replace('.html', '');
  fs.writeFileSync(path.join(OUT, `${base}-element-ids.json`), `${JSON.stringify(ids, null, 2)}\n`, 'utf8');
  console.log(`[gen-webview-id-snapshots] ${base}: ${ids.length} ids`);
}
