import type * as vscode from 'vscode';
import type { BackendMessage, WorkflowInstance } from '../WorkflowDefinition';

export interface ResumeCoordinatorHost {
  bindPanel(panel: vscode.WebviewPanel): void;
  loadInstanceByKey(instanceKey: string): WorkflowInstance | undefined;
  postMessage(panel: vscode.WebviewPanel, msg: BackendMessage): void;
  beginUiResync(): void;
  getInstance(): WorkflowInstance | undefined;
  getCurrentInstanceKey(): string | undefined;
  setInstance(instance: WorkflowInstance): void;
  setCurrentInstanceKey(key: string): void;
  getExecutionDepth(): number;
  clearSaveTimer(): void;
  persistInstanceSnapshot(key: string, inst: WorkflowInstance): void;
  clearExperiencePersistedFlag(): void;
  getDefaultTaskDir(instanceKey: string): string;
  debugLog(stageId: string, event: string, attempt: number, payload?: unknown): void;
  scheduleSave(): void;
  executeNextStage(panel: vscode.WebviewPanel): Promise<void>;
  warn(message: string): void;
}
