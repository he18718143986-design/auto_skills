import * as vscode from 'vscode';
import type { WorkflowEngine } from './WorkflowEngine';
import type { WorkflowPanelFactory } from './WorkflowPanelFactory';
import { pickDeleteScopeAndRemove } from './ExtensionCommands';
import { StagentAiControlsProvider } from './StagentAiControlsProvider';
import { StagentTaskListProvider } from './StagentTaskListProvider';
import { createAiControlsProvider } from './sidebar/AiControlsFactory';
import { uiMsg } from './l10n/uiStrings';
import { createTaskListProvider } from './sidebar/TaskListFactory';

export interface SidebarBootstrapResult {
  refreshAiControls: () => void;
  taskListProvider: StagentTaskListProvider;
}

export function bootstrapStagentSidebar(
  context: vscode.ExtensionContext,
  engine: WorkflowEngine,
  panelFactory: WorkflowPanelFactory,
): SidebarBootstrapResult {
  const refs: {
    aiControls?: StagentAiControlsProvider;
    taskListProvider?: StagentTaskListProvider;
  } = {};

  const refreshAiControls = (): void => {
    void refs.aiControls?.refresh().catch((e) => {
      console.warn(
        `[Stagent] ai_controls_refresh_failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    });
    refs.taskListProvider?.refresh();
  };

  refs.aiControls = createAiControlsProvider(engine, refreshAiControls);
  refs.taskListProvider = createTaskListProvider(engine, panelFactory, refreshAiControls, (instanceKey) => {
    void pickDeleteScopeAndRemove(engine, instanceKey, () => {
      refs.taskListProvider?.refresh();
      refreshAiControls();
    }).catch((e) => {
      console.warn(
        `[Stagent] delete_instance_failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    });
  });

  const aiControls = refs.aiControls;
  const taskListProvider = refs.taskListProvider;

  engine.setInstancesChangedListener(() => taskListProvider.refresh());

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(StagentAiControlsProvider.viewId, aiControls, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.window.registerWebviewViewProvider(StagentTaskListProvider.viewId, taskListProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand('stagent.refreshAiControls', () => {
      refreshAiControls();
    }),
  );

  return { refreshAiControls, taskListProvider };
}

export function offerRecoverableInstance(
  engine: WorkflowEngine,
  panelFactory: WorkflowPanelFactory,
  refreshAiControls: () => void,
): void {
  engine.instances.pruneStaleGlobalInstances();
  const recoverable = engine.instances.getRecoverableInstanceKeys();
  if (recoverable.length === 0) {
    return;
  }
  void (async () => {
    try {
      const resumeLabel = uiMsg('stagent.action.resumeLatestTask');
      const choice = await vscode.window.showWarningMessage(
        uiMsg('stagent.info.recoverPrompt'),
        resumeLabel,
      );
      if (choice !== resumeLabel) {
        return;
      }
      const panel = panelFactory.getOrCreateWorkflowPanel();
      const ok = await engine.instances.resumeInstance(recoverable[0], panel);
      if (!ok) {
        void vscode.window.showErrorMessage(uiMsg('stagent.error.recoverFailed'));
      }
      refreshAiControls();
    } catch (e) {
      console.warn(
        `[Stagent] recover_instance_prompt_failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  })();
}
