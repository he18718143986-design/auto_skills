import type * as vscode from 'vscode';
import type { BackendMessage } from './WorkflowDefinition';
import type {
  WorkflowEngineArtifactFacade,
  WorkflowEngineExecutionFacade,
  WorkflowEngineGenerationFacade,
  WorkflowEngineHitlFacade,
  WorkflowEngineInstanceFacade,
} from './WorkflowEngineFacades';
import { isFrontendMessage } from './WebviewMessageGuards';
import type { WorkflowEngineDiagnostics } from './WorkflowEngineDiagnostics';
import type { WorkflowEngineLifecycle } from './engine-facades/WorkflowEngineLifecycle';
import { createWorkflowEngineParts } from './engine-wiring/createWorkflowEngineParts';

export { isFrontendMessage };

export { evaluateSkipCondition } from './WorkflowSkipCondition';

export { estimateTokens } from './WorkflowInputContent';

export class WorkflowEngine {
  private readonly lifecycle: WorkflowEngineLifecycle;
  private readonly diagnostics: WorkflowEngineDiagnostics;

  readonly instances: WorkflowEngineInstanceFacade;
  readonly generation: WorkflowEngineGenerationFacade;
  readonly execution: WorkflowEngineExecutionFacade;
  readonly hitl: WorkflowEngineHitlFacade;
  readonly artifacts: WorkflowEngineArtifactFacade;

  constructor(context: vscode.ExtensionContext) {
    const parts = createWorkflowEngineParts(context);
    this.lifecycle = parts.lifecycle;
    this.diagnostics = parts.diagnostics;
    this.instances = parts.facades.instances;
    this.generation = parts.facades.generation;
    this.execution = parts.facades.execution;
    this.hitl = parts.facades.hitl;
    this.artifacts = parts.facades.artifacts;
  }

  persistMilestone(): void {
    this.lifecycle.persistMilestone();
  }

  postMessage(panel: vscode.WebviewPanel | undefined, msg: BackendMessage): void {
    this.lifecycle.postMessage(panel, msg);
  }

  setInstancesChangedListener(listener: (() => void) | undefined): void {
    this.lifecycle.setInstancesChangedListener(listener);
  }

  warn(message: string): void {
    this.diagnostics.warn(message);
  }
}

export type {
  WorkflowEngineArtifactFacade,
  WorkflowEngineExecutionFacade,
  WorkflowEngineFacade,
  WorkflowEngineGenerationFacade,
  WorkflowEngineHitlFacade,
  WorkflowEngineInstanceFacade,
} from './WorkflowEngineFacades';
