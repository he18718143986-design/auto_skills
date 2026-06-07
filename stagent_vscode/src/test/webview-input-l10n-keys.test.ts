import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');
const VIEW_INPUT = path.join(ROOT, 'src/webview/runtime/view-input.ts');
const L10N = path.join(ROOT, 'src/l10n/webview-ui-strings.json');

test('view-input.ts does not use corrupted webvieinputStore NLS keys', () => {
  const src = fs.readFileSync(VIEW_INPUT, 'utf8');
  assert.equal(src.includes('webvieinputStore'), false, 'corrupted key prefix must be removed');
});

test('view-input wMsg keys exist in webview-ui-strings.json', () => {
  const src = fs.readFileSync(VIEW_INPUT, 'utf8');
  const l10n = JSON.parse(fs.readFileSync(L10N, 'utf8')) as Record<string, unknown>;
  const re = /wMsg\(\s*['"](stagent\.webview\.[^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  const keys = new Set<string>();
  while ((m = re.exec(src)) !== null) {
    keys.add(m[1]!);
  }
  assert.ok(keys.size > 0, 'expected wMsg keys in view-input.ts');
  for (const key of keys) {
    assert.ok(key in l10n, `missing webview l10n key: ${key}`);
  }
});
