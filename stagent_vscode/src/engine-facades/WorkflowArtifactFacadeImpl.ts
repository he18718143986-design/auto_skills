import type * as vscode from 'vscode';
import type { WorkflowEngineArtifactFacade } from '../WorkflowEngineFacades';
import type { WorkflowEngineHostRegistry } from '../WorkflowEngineHostRegistry';
import {
  copyRecentDebugLogAction,
  copyRecentSessionLogAction,
  openArtifactDiffAction,
  openArtifactFileAction,
  openDebugLogAction,
} from '../WorkflowArtifactUi';

export interface WorkflowArtifactFacadeDeps {
  context: vscode.ExtensionContext;
  hostRegistry: WorkflowEngineHostRegistry;
}

export class WorkflowArtifactFacadeImpl implements WorkflowEngineArtifactFacade {
  constructor(private readonly deps: WorkflowArtifactFacadeDeps) {}

  openArtifactFile(stageId: string, filePath: string): Promise<void> {
    return openArtifactFileAction(this.deps.hostRegistry.artifactUiHost(), stageId, filePath);
  }

  openArtifactDiff(stageId: string, filePath: string): Promise<void> {
    return openArtifactDiffAction(this.deps.hostRegistry.artifactUiHost(), stageId, filePath);
  }

  copyRecentDebugLog(): Promise<void> {
    return copyRecentDebugLogAction(this.deps.hostRegistry.artifactUiHost());
  }

  copyRecentSessionLog(): Promise<void> {
    return copyRecentSessionLogAction(this.deps.context.globalStorageUri.fsPath);
  }

  openDebugLog(): Promise<void> {
    return openDebugLogAction(this.deps.hostRegistry.artifactUiHost());
  }
}
