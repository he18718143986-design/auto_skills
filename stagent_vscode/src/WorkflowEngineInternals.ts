import type * as vscode from 'vscode';
import type { EngineHostFactoryDeps } from './WorkflowEngineHostFactories';
import type { LlmClient } from './LlmClient';
import type { WorkflowEngineDiagnostics } from './WorkflowEngineDiagnostics';
import { WorkflowEngineHostRegistry } from './WorkflowEngineHostRegistry';
import type { WorkflowGenerationService } from './WorkflowGenerationService';
import type { WorkflowInstanceManager } from './WorkflowInstanceManager';
import type { WorkflowUiBridge } from './WorkflowUiBridge';
import { EngineDiagnosticsOps } from './EngineDiagnosticsOps';
import { EngineExecutionRunner } from './EngineExecutionRunner';
import { EngineHostFactoryBuilder } from './EngineHostFactoryBuilder';

export { MAX_STAGES_WARN } from './workflow/WorkflowLimits';

export interface WorkflowEngineInternalsHost {
  context: vscode.ExtensionContext;
  instances: WorkflowInstanceManager;
  generation: WorkflowGenerationService;
  ui: WorkflowUiBridge;
  llm: LlmClient;
  diagnostics: WorkflowEngineDiagnostics;
  hostRegistry: WorkflowEngineHostRegistry;
  getExecutionDepth(): number;
  setExecutionDepth(depth: number): void;
  getPreferredModelFamily(): string;
  getInstancesChangedListener(): (() => void) | undefined;
  getOutputChannelRef(): vscode.OutputChannel | undefined;
  setOutputChannelRef(channel: vscode.OutputChannel | undefined): void;
}

export class WorkflowEngineInternals {
  private readonly diagnosticsOps: EngineDiagnosticsOps;
  private readonly hostFactoryBuilder: EngineHostFactoryBuilder;
  private readonly executionRunner: EngineExecutionRunner;
  private cachedHostFactoryDeps: EngineHostFactoryDeps | undefined;

  constructor(private readonly host: WorkflowEngineInternalsHost) {
    this.diagnosticsOps = new EngineDiagnosticsOps(host);
    this.hostFactoryBuilder = new EngineHostFactoryBuilder(host, this.diagnosticsOps);
    this.executionRunner = new EngineExecutionRunner(host);
  }

  hostFactoryDeps(executeNextStage: (panel?: vscode.WebviewPanel) => Promise<void>): EngineHostFactoryDeps {
    if (!this.cachedHostFactoryDeps) {
      this.cachedHostFactoryDeps = this.hostFactoryBuilder.build(executeNextStage);
    }
    return this.cachedHostFactoryDeps;
  }

  getOutputChannel(): vscode.OutputChannel {
    return this.diagnosticsOps.getOutputChannel();
  }

  warn(message: string): void {
    this.diagnosticsOps.warn(message);
  }

  degraded(reason: string, context?: Record<string, unknown>): void {
    this.diagnosticsOps.degraded(reason, context);
  }

  debugLog(stageId: string, event: string, attempt: number, payload?: unknown): void {
    this.diagnosticsOps.debugLog(stageId, event, attempt, payload);
  }

  ensureTaskDir(instanceKey: string): string {
    return this.diagnosticsOps.ensureTaskDir(instanceKey);
  }

  invokeLlmRaw(
    systemPrompt: string,
    userContent: string,
    panel: vscode.WebviewPanel,
    traceStageId: string,
  ): Promise<string> {
    return this.diagnosticsOps.invokeLlmRaw(systemPrompt, userContent, panel, traceStageId);
  }

  pickZoomOutFilePath(preferred?: string): string {
    return this.diagnosticsOps.pickZoomOutFilePath(preferred);
  }

  async runExecuteNextStageLoop(panel?: vscode.WebviewPanel): Promise<void> {
    return this.executionRunner.runExecuteNextStageLoop(panel);
  }
}
