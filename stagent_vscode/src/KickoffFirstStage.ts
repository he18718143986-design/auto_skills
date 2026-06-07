import type * as vscode from 'vscode';
import type { WorkflowDefinition } from './WorkflowDefinition';
import { buildSessionSyncedMessage } from './InstanceSession';
import type { StartExecutionHost } from './WorkflowStartCoordinator';

export async function kickoffFirstWorkflowStage(
  host: StartExecutionHost,
  panel: vscode.WebviewPanel,
  wf: WorkflowDefinition,
  instanceId: string,
  taskDir: string,
): Promise<void> {
  host.writeProcessDocs(wf, taskDir);
  host.persistMilestone();
  host.scheduleSave();
  host.postMessage(panel, buildSessionSyncedMessage(instanceId));
  host.postMessage(panel, {
    type: 'instanceKeySynced',
    instanceKey: instanceId,
  });
  await host.executeNextStage(panel);
}
