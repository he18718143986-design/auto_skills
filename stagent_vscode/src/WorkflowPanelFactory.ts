import * as vscode from 'vscode';
import type { FrontendMessage } from './WorkflowDefinition';
import { isFrontendMessage, type WorkflowEngine } from './WorkflowEngine';
import { routeWorkflowPanelMessage } from './WorkflowPanelMessageRouter';
import { uiMsg } from './l10n/uiStrings';
import { buildWorkflowWebviewHtml } from './WebviewPanel';

export interface WorkflowPanelFactory {
  getOrCreateWorkflowPanel(): vscode.WebviewPanel;
}

export function createWorkflowPanelFactory(
  context: vscode.ExtensionContext,
  engine: WorkflowEngine,
  onAfterMessage: () => void,
): WorkflowPanelFactory {
  let workflowPanel: vscode.WebviewPanel | undefined;

  const createWorkflowPanel = (): vscode.WebviewPanel => {
    const panel = vscode.window.createWebviewPanel(
      'stagent.workflow',
      'Stagent · AI 工作流',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [context.extensionUri],
    };
    panel.webview.html = buildWorkflowWebviewHtml(panel.webview);
    return panel;
  };

  const wirePanelHandlers = (panel: vscode.WebviewPanel): void => {
    panel.webview.onDidReceiveMessage(async (msg: unknown) => {
      if (!isFrontendMessage(msg)) {
        return;
      }
      try {
        await routeWorkflowPanelMessage(engine, panel, msg as FrontendMessage, (m) =>
          engine.warn(m),
        );
      } catch (err) {
        const mes = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(uiMsg('stagent.error.generic', mes));
      } finally {
        onAfterMessage();
      }
    });
  };

  const getOrCreateWorkflowPanel = (): vscode.WebviewPanel => {
    if (workflowPanel) {
      workflowPanel.reveal(vscode.ViewColumn.One);
      return workflowPanel;
    }
    workflowPanel = createWorkflowPanel();
    wirePanelHandlers(workflowPanel);
    workflowPanel.onDidDispose(() => {
      workflowPanel = undefined;
    });
    return workflowPanel;
  };

  return { getOrCreateWorkflowPanel };
}
