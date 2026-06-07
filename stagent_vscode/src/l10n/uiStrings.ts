import * as fs from 'fs';
import * as path from 'path';

let nlsBundle: Record<string, string> | undefined;

function loadDefaultNlsBundle(): Record<string, string> {
  if (nlsBundle) {
    return nlsBundle;
  }
  try {
    const nlsPath = path.join(__dirname, '..', '..', 'package.nls.json');
    nlsBundle = JSON.parse(fs.readFileSync(nlsPath, 'utf-8')) as Record<string, string>;
  } catch {
    nlsBundle = {};
  }
  return nlsBundle;
}

function formatNlsTemplate(template: string, args: Array<string | number>): string {
  let out = template;
  for (let i = 0; i < args.length; i++) {
    out = out.replace(new RegExp(`\\{${i}\\}`, 'g'), String(args[i]));
  }
  return out;
}

function resolveViaVscodeL10n(key: string, args: Array<string | number>): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const vscode = require('vscode') as typeof import('vscode');
    const resolved = (vscode.l10n.t as (k: string, ...a: Array<string | number>) => string).apply(
      vscode.l10n,
      [key, ...args],
    );
    if (resolved && resolved !== key) {
      return resolved;
    }
  } catch {
    // node --test / scripts without extension host
  }
  return undefined;
}

export function uiMsg(key: string, ...args: Array<string | number>): string {
  const fromVscode = resolveViaVscodeL10n(key, args);
  if (fromVscode !== undefined) {
    return fromVscode;
  }
  const template = loadDefaultNlsBundle()[key];
  if (template) {
    return formatNlsTemplate(template, args);
  }
  if (args.length === 0) {
    return key;
  }
  return formatNlsTemplate(key, args);
}
