import { wMsg } from './wMsg';

/** Webview bundle: read injected `window.__stagentL10n` only (no vscode import). */
export function resolveWebviewString(key: string, ...args: Array<string | number>): string {
  return wMsg(key, ...args);
}
