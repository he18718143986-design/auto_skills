import type * as vscode from 'vscode';
import { showWarningToast } from './adapters/showWarningToast';
import { readWorkspaceFolderPath } from './adapters/vscodeWorkspacePaths';
import { uiMsg } from './l10n/uiStrings';
import type { ToolPathBase } from './WorkflowDefinition';
import { trackPersistedFileForInstance } from './WorkflowEngineArtifactBridge';
import { getOrCreateStagentOutputChannel } from './WorkflowEngineOutputHelper';
import type { WorkflowEngineInternalsHost } from './WorkflowEngineInternals';
import type { GenerationOperationId } from './generation/GenerationOperationIds';

export class EngineDiagnosticsOps {
  constructor(private readonly host: WorkflowEngineInternalsHost) {}

  getOutputChannel(): vscode.OutputChannel {
    const channel = getOrCreateStagentOutputChannel(
      this.host.context,
      this.host.getOutputChannelRef(),
    );
    this.host.setOutputChannelRef(channel);
    return channel;
  }

  trackPersistedFile(input: {
    stageId: string;
    outputKey: string;
    filePath: string;
    content: string;
    existedBefore: boolean;
    priorContent?: string;
  }): void {
    trackPersistedFileForInstance(this.host.instances.lifecycle.getInstance(), input, (c) =>
      this.host.diagnostics.warn(
        `artifact_same_path_overwrite path=${c.filePath} stage=${c.incomingStageId} prior=${c.priorStageId}`,
      ),
    );
  }

  bindPanel(panel: vscode.WebviewPanel | undefined): void {
    this.host.ui.bindPanel(panel);
  }

  postGenerationProgress(
    panel: vscode.WebviewPanel,
    operation: GenerationOperationId,
    phase: 'preparing' | 'llm' | 'parsing' | 'validating',
    message: string,
    detail?: string,
  ): void {
    this.host.ui.postGenerationProgress(panel, operation, phase, message, detail);
  }

  markStageArtifactsApproved(stageId: string): void {
    this.host.ui.markStageArtifactsApproved(this.host.instances.lifecycle.getInstance(), stageId);
  }

  warn(message: string): void {
    this.host.diagnostics.warn(message);
  }

  degraded(reason: string, context?: Record<string, unknown>): void {
    this.host.diagnostics.degraded(reason, context);
  }

  debugLog(stageId: string, event: string, attempt: number, payload?: unknown): void {
    this.host.diagnostics.debugLog(stageId, event, attempt, payload);
  }

  error(message: string): void {
    this.host.diagnostics.error(message);
  }

  notifyInstancesChanged(): void {
    try {
      this.host.getInstancesChangedListener()?.();
    } catch (e) {
      this.warn(`instances_changed_listener_failed: ${String(e)}`);
    }
  }

  rejectApproveDecision(panel: vscode.WebviewPanel, stageId: string, reason: string): void {
    this.warn(`approveDecision_rejected stageId=${stageId} reason=${reason}`);
    void showWarningToast(uiMsg('stagent.warn.diagnostics', reason));
    this.host.ui.postMessage(panel, {
      type: 'actionHint',
      message: reason,
      stageId,
    });
  }

  workspaceFolderPath(): string | undefined {
    return readWorkspaceFolderPath();
  }

  invokeLlmRaw(
    systemPrompt: string,
    userContent: string,
    panel: vscode.WebviewPanel,
    traceStageId: string,
  ): Promise<string> {
    return this.host.llm.invokeRaw(systemPrompt, userContent, panel, traceStageId);
  }

  pathHost() {
    return this.host.hostRegistry.pathHost();
  }

  ensureTaskDir(instanceKey: string): string {
    return this.pathHost().ensureTaskDir(instanceKey);
  }

  getWorkspaceRootAbsolute(): string | undefined {
    return this.pathHost().getWorkspaceRootAbsolute();
  }

  resolveOutputPath(instanceKey: string, filePath: string, base: ToolPathBase = 'instance'): string {
    return this.pathHost().resolveOutputPath(instanceKey, filePath, base);
  }

  pickZoomOutFilePath(preferred?: string): string {
    return this.pathHost().pickZoomOutFilePath(preferred);
  }
}
