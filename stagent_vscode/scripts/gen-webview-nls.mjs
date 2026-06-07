#!/usr/bin/env node
/** One-off maintainer script: merge src/l10n/webview-ui-strings.json into package.nls*.json */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'src/l10n/webview-ui-strings.json'), 'utf8'),
);

function merge(intoPath, locale) {
  const pkg = JSON.parse(fs.readFileSync(intoPath, 'utf8'));
  for (const [key, vals] of Object.entries(data)) {
    pkg[key] = vals[locale];
  }
  fs.writeFileSync(intoPath, JSON.stringify(pkg, null, 2) + '\n');
}

merge(path.join(ROOT, 'package.nls.json'), 'en');
merge(path.join(ROOT, 'package.nls.zh-cn.json'), 'zh');
console.log(`[gen-webview-nls] merged ${Object.keys(data).length} keys`);
