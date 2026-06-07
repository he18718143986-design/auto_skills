/**
 * 侧栏「Stagent · 任务列表」：移植自 ai-workflow TaskListSidebarProvider。
 * — 历史任务列表（状态圆点 / 进度条 / 相对时间）、新建任务、点击恢复、删除任务、空状态。
 *
 * 数据来自 WorkflowEngine.getTaskListItems()（已映射为轻量 TaskListItem，含 globalState 实例键）。
 */

import type * as vscode from 'vscode';
import { buildWebviewCspMeta, createWebviewNonce } from './WebviewCsp';
import { buildSidebarWebviewScript } from './WebviewScript';
import { getWebviewUiStrings } from './l10n/getWebviewUiStrings';
import { loadWebviewStyle, renderWebviewTemplate } from './WebviewTemplateLoader';
import type { TaskListItem } from './WorkflowInstanceQuery';
import {
  SIDEBAR_MSG_DELETE_TASK,
  SIDEBAR_MSG_NEW_TASK,
  SIDEBAR_MSG_READY,
  SIDEBAR_MSG_REFRESH,
  SIDEBAR_MSG_RESUME_TASK,
  SIDEBAR_MSG_UPDATE_LIST,
} from './workflow/SidebarMessageTypes';

export class StagentTaskListProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'stagent.taskList';

  private _view?: vscode.WebviewView;

  constructor(
    private readonly getItems: () => TaskListItem[],
    private readonly onResumeTask: (instanceKey: string) => void,
    private readonly onNewTask: () => void,
    private readonly onDeleteTask: (instanceKey: string) => void,
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((msg: { type: string; instanceId?: string }) => {
      switch (msg.type) {
        case SIDEBAR_MSG_READY:
          this.push();
          break;
        case SIDEBAR_MSG_NEW_TASK:
          this.onNewTask();
          break;
        case SIDEBAR_MSG_RESUME_TASK:
          if (msg.instanceId) {
            this.onResumeTask(msg.instanceId);
          }
          break;
        case SIDEBAR_MSG_DELETE_TASK:
          if (msg.instanceId) {
            this.onDeleteTask(msg.instanceId);
          }
          break;
        case SIDEBAR_MSG_REFRESH:
          this.push();
          break;
        default:
          break;
      }
    });

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.push();
      }
    });
  }

  refresh(): void {
    this.push();
  }

  private push(): void {
    if (!this._view) {
      return;
    }
    const items = [...this.getItems()].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
    this._view.webview.postMessage({ type: SIDEBAR_MSG_UPDATE_LIST, items });
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = createWebviewNonce();
    const csp = buildWebviewCspMeta(webview, nonce);
    return renderWebviewTemplate('task-list.html', {
      CSP: csp,
      NONCE: nonce,
      STYLES: loadWebviewStyle('task-list.css'),
      L10N_JSON: JSON.stringify(getWebviewUiStrings()),
      SCRIPT: buildSidebarWebviewScript('task-list.js'),
    });
  }
}
