import type * as vscode from 'vscode';
import { getWebviewUiStrings } from './l10n/getWebviewUiStrings';
import { buildWebviewCspMeta, createWebviewNonce } from './WebviewCsp';
import { buildWebviewScript } from './WebviewScript';
import { loadWebviewStyle, renderWebviewTemplate } from './WebviewTemplateLoader';

export function buildWorkflowWebviewHtml(webview: vscode.Webview): string {
  const nonce = createWebviewNonce();
  const csp = buildWebviewCspMeta(webview, nonce);

  return renderWebviewTemplate('main-panel.html', {
    CSP: csp,
    NONCE: nonce,
    STYLES: loadWebviewStyle('main-panel.css'),
    L10N_JSON: JSON.stringify(getWebviewUiStrings()),
    SCRIPT: buildWebviewScript(),
  });
}
