import type * as vscode from 'vscode';
import type { FrontendMessage } from './WorkflowDefinition';
import type { WorkflowEngine } from './WorkflowEngine';
import { uiMsg } from './l10n/uiStrings';
import { buildPanelHandlerMap } from './panel-handlers/registry';
import type { PanelHandlerContext } from './panel-handlers/types';

/** 主 Webview 前端消息路由（从 extension.ts 抽出）。 */
export async function routeWorkflowPanelMessage(
  engine: WorkflowEngine,
  panel: vscode.WebviewPanel,
  msg: FrontendMessage,
  warn: (message: string) => void,
): Promise<void> {
  const ctx: PanelHandlerContext = { engine, panel };
  const handler = buildPanelHandlerMap()[msg.type];
  if (!handler) {
    warn(`panel_message_unhandled type=${msg.type}`);
    void panel.webview.postMessage({
      type: 'actionHint',
      message: uiMsg('stagent.warn.panelMessageUnhandled', msg.type),
    });
    return;
  }
  await handler(ctx, msg);
}
