import type * as vscode from 'vscode';

export interface WebviewCspOptions {
  /** 允许内联 `<style>`（主面板 / 侧栏当前均为内联样式）。 */
  allowInlineStyles?: boolean;
}

/**
 * 统一 Webview CSP：脚本仅 nonce；样式默认允许 cspSource + unsafe-inline（内联 style 块）。
 */
export function buildWebviewCspMeta(
  webview: vscode.Webview,
  nonce: string,
  options: WebviewCspOptions = {},
): string {
  const allowInlineStyles = options.allowInlineStyles !== false;
  const styleSrc = allowInlineStyles
    ? `style-src ${webview.cspSource} 'unsafe-inline'`
    : `style-src ${webview.cspSource}`;
  return [
    `default-src 'none'`,
    styleSrc,
    `script-src 'nonce-${nonce}'`,
  ].join('; ');
}

export function createWebviewNonce(): string {
  let s = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    s += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return s;
}
