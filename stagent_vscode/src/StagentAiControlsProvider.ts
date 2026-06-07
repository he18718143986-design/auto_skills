/**
 * 侧栏「Stagent · AI 控制」：对齐 ai-workflow AiControlsProvider 的轻量实现。
 * — vscode.lm 模型下拉、当前阶段摘要、刷新、打开设置、环境状态（Copilot / 直接 API）。
 */

import type * as vscode from 'vscode';
import { buildWebviewCspMeta, createWebviewNonce } from './WebviewCsp';
import { buildSidebarWebviewScript } from './WebviewScript';
import { getWebviewUiStrings } from './l10n/getWebviewUiStrings';
import { loadWebviewStyle, renderWebviewTemplate } from './WebviewTemplateLoader';
import {
  SIDEBAR_MSG_OPEN_SETTINGS,
  SIDEBAR_MSG_READY,
  SIDEBAR_MSG_REFRESH,
  SIDEBAR_MSG_RETRY,
  SIDEBAR_MSG_SET_MODEL,
  SIDEBAR_MSG_SET_PROFILE,
  SIDEBAR_MSG_UPDATE_STATE,
} from './workflow/SidebarMessageTypes';

export interface StagentAiControlsState {
  models: { id: string; name: string }[];
  preferredModel: string;
  stageInfo: {
    instanceTitle: string;
    stageId: string;
    stageName: string;
    stageIndex: number;
    stageTotal: number;
    /** 已完成阶段数（done/skipped 等），用于进度条 */
    completedStages: number;
    status: string;
  } | null; // 无当前实例或未开始执行时为 null
  retryStageOptions: { stageId: string; stageName: string; status: string }[];
  envStatus: {
    copilot: boolean;
    apiKey: boolean;
    llmBaseUrl: string;
    llmModel: string;
  };
  /** code-runner 沙箱能力摘要（sidebar 徽章）。 */
  sandboxStatus: {
    enabled: boolean;
    enforced: boolean;
    platform: string;
    detail: string;
  };
  settingsProfile: string;
  profileHighlights: string[];
}

export class StagentAiControlsProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'stagent.aiControls';

  private _view?: vscode.WebviewView;

  constructor(
    private readonly getState: () => Promise<StagentAiControlsState>,
    private readonly onSetModel: (modelFamily: string) => void,
    private readonly onRetry: (stageId: string) => void,
    private readonly onOpenSettings: (query: string) => void,
    private readonly onSetProfile?: (profileId: string) => void,
    private readonly onError?: (message: string) => void,
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((msg: {
      type: string;
      modelId?: string;
      stageId?: string;
      query?: string;
      profileId?: string;
    }) => {
      void this.handleMessage(msg);
    });

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        void this.push().catch((e) => this.reportError(e));
      }
    });
  }

  private reportError(e: unknown): void {
    const mes = e instanceof Error ? e.message : String(e);
    if (this.onError) {
      this.onError(mes);
    } else {
      console.warn(`[Stagent] ai_controls_error: ${mes}`);
    }
  }

  private async handleMessage(msg: {
    type: string;
    modelId?: string;
    stageId?: string;
    query?: string;
    profileId?: string;
  }): Promise<void> {
    try {
      switch (msg.type) {
        case SIDEBAR_MSG_READY:
          await this.push();
          break;
        case SIDEBAR_MSG_SET_MODEL:
          if (msg.modelId !== undefined) {
            this.onSetModel(msg.modelId);
          }
          await this.push();
          break;
        case SIDEBAR_MSG_RETRY:
          if (msg.stageId) {
            this.onRetry(msg.stageId);
          }
          await this.push();
          break;
        case SIDEBAR_MSG_OPEN_SETTINGS:
          this.onOpenSettings(msg.query ?? 'stagent');
          break;
        case SIDEBAR_MSG_SET_PROFILE:
          if (msg.profileId && this.onSetProfile) {
            this.onSetProfile(msg.profileId);
          }
          await this.push();
          break;
        case SIDEBAR_MSG_REFRESH:
          await this.push();
          break;
        default:
          break;
      }
    } catch (e) {
      this.reportError(e);
    }
  }

  async refresh(): Promise<void> {
    await this.push();
  }

  private async push(): Promise<void> {
    if (!this._view) {
      return;
    }
    const state = await this.getState();
    this._view.webview.postMessage({ type: SIDEBAR_MSG_UPDATE_STATE, state });
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = createWebviewNonce();
    const csp = buildWebviewCspMeta(webview, nonce);
    return renderWebviewTemplate('ai-controls.html', {
      CSP: csp,
      NONCE: nonce,
      STYLES: loadWebviewStyle('ai-controls.css'),
      L10N_JSON: JSON.stringify(getWebviewUiStrings()),
      SCRIPT: buildSidebarWebviewScript('ai-controls.js'),
    });
  }
}
