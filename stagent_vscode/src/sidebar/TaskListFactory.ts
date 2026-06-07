import * as vscode from 'vscode';
import { StagentTaskListProvider } from '../StagentTaskListProvider';
import type { WorkflowEngine } from '../WorkflowEngine';
import { uiMsg } from '../l10n/uiStrings';
import type { WorkflowPanelFactory } from '../WorkflowPanelFactory';

export function createTaskListProvider(
  engine: WorkflowEngine,
  panelFactory: WorkflowPanelFactory,
  refreshAiControls: () => void,
  onDeleteInstance: (instanceKey: string) => void,
): StagentTaskListProvider {
  return new StagentTaskListProvider(
    () => engine.instances.getTaskListItems(),
    (instanceKey) => {
      const panel = panelFactory.getOrCreateWorkflowPanel();
      void engine.instances
        .resumeInstance(instanceKey, panel)
        .then((ok) => {
          if (!ok) {
            void vscode.window.showErrorMessage(uiMsg('stagent.error.recoverFailed'));
          }
          refreshAiControls();
        })
        .catch((err) => {
          const mes = err instanceof Error ? err.message : String(err);
          void vscode.window.showErrorMessage(uiMsg('stagent.error.generic', mes));
        });
    },
    () => {
      void vscode.commands.executeCommand('stagent.newTask');
    },
    onDeleteInstance,
  );
}
