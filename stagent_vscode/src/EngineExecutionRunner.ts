import type * as vscode from 'vscode';
import { executeNextStageLoop } from './WorkflowExecutor';
import { buildExecuteNextStageLoopParams } from './WorkflowEngineExecutionBinder';
import { WorkflowParallelMonitor } from './WorkflowParallelMonitor';
import type { WorkflowEngineInternalsHost } from './WorkflowEngineInternals';

export class EngineExecutionRunner {
  constructor(private readonly host: WorkflowEngineInternalsHost) {}

  beginExecutionDepth(): void {
    this.host.setExecutionDepth(this.host.getExecutionDepth() + 1);
  }

  endExecutionDepth(): void {
    this.host.setExecutionDepth(Math.max(0, this.host.getExecutionDepth() - 1));
  }

  async runExecuteNextStageLoop(panel?: vscode.WebviewPanel): Promise<void> {
    this.host.ui.bindPanel(panel);
    const targetPanel = panel ?? this.host.ui.getActivePanel();
    const instance = this.host.instances.lifecycle.getInstance();
    if (!instance || !targetPanel) {
      // Silent no-op here would make kickoff/resume "look started" while nothing runs.
      // No panel is available to deliver UI feedback, so surface it for observability.
      this.host.diagnostics.warn(
        `execute_loop_noop hasInstance=${!!instance} hasPanel=${!!targetPanel}`,
      );
      return;
    }
    this.beginExecutionDepth();
    try {
      const parallelMonitor = new WorkflowParallelMonitor();
      await executeNextStageLoop(
        buildExecuteNextStageLoopParams(
          this.host.hostRegistry.stageExecutionHost(),
          targetPanel,
          parallelMonitor,
        ),
      );
    } finally {
      this.endExecutionDepth();
    }
  }
}
