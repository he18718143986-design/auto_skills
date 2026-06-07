import type * as vscode from 'vscode';
import type { DeleteScope } from './WorkflowDeletePlan';
import type { TaskListItem } from './WorkflowInstanceQuery';
import type { BackendMessage, WorkflowDefinition, WorkflowInstance } from './WorkflowDefinition';
import type { HitlRetryResult } from './hitl/HitlRetryResult';
import type { UpstreamFixResult } from './retry/UpstreamFixResult';
import type { WorkflowStageProgressInfo } from './WorkflowStageProgressQuery';

export interface WorkflowEngineGenerationFacade {
  polishUserTask(
    draft: string,
    taskType: string,
    panel: vscode.WebviewPanel,
    taskWorkspacePathRaw?: string,
  ): Promise<void>;
  generateClarifyQuestions(
    userInput: string,
    taskType: string,
    taskWorkspacePathRaw: string,
    panel: vscode.WebviewPanel,
  ): Promise<void>;
  generateWorkflow(
    userInput: string,
    taskType: string,
    panel: vscode.WebviewPanel,
    taskWorkspacePathRaw: string,
    polishContext?: { originalDraft: string; polishedAt: string },
    clarifyAnswers?: Record<string, string>,
  ): Promise<void>;
}

export interface WorkflowEngineInstanceFacade {
  getTaskListItems(): TaskListItem[];
  getTaskSummaries(): WorkflowInstance[];
  deleteInstance(instanceKey: string, scope?: DeleteScope): void;
  resumeInstance(instanceKey: string, panel: vscode.WebviewPanel): Promise<boolean>;
  getRecoverableInstanceKeys(): string[];
  pruneStaleGlobalInstances(): void;
  getActiveInstanceKey(): string | undefined;
  getActiveInstance(): WorkflowInstance | undefined;
  getActiveSessionId(): string | undefined;
  getCurrentStageInfo(): WorkflowStageProgressInfo | undefined;
  resyncPanelUi(panel: vscode.WebviewPanel): void;
}

export interface WorkflowEngineExecutionFacade {
  startExecution(
    panel: vscode.WebviewPanel,
    workflowOverride?: WorkflowDefinition,
    instanceKey?: string,
  ): Promise<void>;
  executeNextStage(panel?: vscode.WebviewPanel): Promise<void>;
  isExecutionInFlight(): boolean;
  getPreferredModelFamily(): string;
  setPreferredModelFamily(modelFamily: string): void;
  getActivePanel(): vscode.WebviewPanel | undefined;
}

export interface WorkflowEngineHitlFacade {
  approve(stageId: string, panel: vscode.WebviewPanel): Promise<void>;
  approveDecision(
    stageId: string,
    decisionRecord: string,
    panel: vscode.WebviewPanel,
    instanceKey?: string,
  ): Promise<void>;
  answerQuestions(
    stageId: string,
    answers: Record<string, string>,
    panel: vscode.WebviewPanel,
  ): Promise<void>;
  answerQuestionsBefore(
    stageId: string,
    answers: Record<string, string>,
    panel: vscode.WebviewPanel,
  ): Promise<void>;
  retry(stageId: string, comment: string, panel: vscode.WebviewPanel): Promise<HitlRetryResult>;
  upstreamFix(failedStageId: string, panel: vscode.WebviewPanel): Promise<UpstreamFixResult>;
  editOutput(stageId: string, outputKey: string, newContent: unknown): void;
}

export interface WorkflowEngineArtifactFacade {
  openArtifactFile(stageId: string, filePath: string): Promise<void>;
  openArtifactDiff(stageId: string, filePath: string): Promise<void>;
  copyRecentDebugLog(): Promise<void>;
  copyRecentSessionLog(): Promise<void>;
  openDebugLog(): Promise<void>;
}

export type WorkflowEngineFacade = WorkflowEngineGenerationFacade &
  WorkflowEngineInstanceFacade &
  WorkflowEngineExecutionFacade &
  WorkflowEngineHitlFacade &
  WorkflowEngineArtifactFacade;
