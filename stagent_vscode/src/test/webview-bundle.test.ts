import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildWebviewScript } from '../WebviewScript';
import { WEBVIEW_HELPER_EXPORTS } from '../webview/webview-helpers-entry';

const ROOT = path.resolve(__dirname, '..', '..');
const BUNDLE_PATH = path.join(ROOT, 'out/webview/webview-helpers.js');

test('#6 webview helpers bundle exists after compile', () => {
  assert.ok(fs.existsSync(BUNDLE_PATH), `missing ${BUNDLE_PATH}; run npm run compile`);
  const stat = fs.statSync(BUNDLE_PATH);
  assert.ok(stat.size > 1000, 'bundle unexpectedly small');
});

test('#6 bundle exposes all helpers on __stagentWebviewHelpers with global var bindings', () => {
  const bundle = fs.readFileSync(BUNDLE_PATH, 'utf8');
  assert.match(bundle, /var __stagentWebviewHelpers\s*=/);
  for (const name of WEBVIEW_HELPER_EXPORTS) {
    assert.match(
      bundle,
      new RegExp(`var ${name}\\s*=\\s*__stagentWebviewHelpers\\.${name}\\s*;`),
      `missing global binding for ${name}`,
    );
  }
});

test('#6 buildWebviewScript concatenates helpers, shared, and main bundles', () => {
  const script = buildWebviewScript();
  assert.equal(script.includes('.toString()'), false);
  assert.match(script, /__stagentWebviewHelpers/);
  assert.match(script, /__stagentWebviewShared/);
  assert.match(script, /bootstrapMainWebview/);
  for (const name of ['getPauseUiState', 'buildAnswerQuestionsMessage', 'formatPlanSummaryLines']) {
    assert.match(script, new RegExp(`var ${name}\\s*=\\s*__stagentWebviewHelpers\\.${name}`));
  }
  assert.match(script, /var escapeHtml\s*=\s*__stagentWebviewShared\.escapeHtml/);
});

test('#6 WEBVIEW_HELPER_EXPORTS count matches webview bundle export list', () => {
  assert.equal(WEBVIEW_HELPER_EXPORTS.length, 35);
});
