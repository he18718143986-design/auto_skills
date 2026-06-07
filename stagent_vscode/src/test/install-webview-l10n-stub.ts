/**
 * node --test 无 webview 运行时：注入中文 __stagentL10n，供 resolveWebviewString / wMsg 使用。
 */
import * as fs from 'fs';
import * as path from 'path';

const jsonPath = path.join(__dirname, '..', 'l10n', 'webview-ui-strings.json');
try {
  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as Record<string, { zh: string }>;
  (globalThis as { __stagentL10n?: Record<string, string> }).__stagentL10n = Object.fromEntries(
    Object.entries(raw).map(([key, vals]) => [key, vals.zh]),
  );
} catch {
  // bundle missing in partial checkouts
}
