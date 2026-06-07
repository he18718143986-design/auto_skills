import * as vscode from 'vscode';
import type { DeleteScope } from './WorkflowDeletePlan';
import type { TaskListItem } from './WorkflowInstanceQuery';
import type { ExtensionRuntime } from './extension/ExtensionRuntime';
import { uiMsg } from './l10n/uiStrings';
import type { WorkflowEngine } from './WorkflowEngine';

export async function pickDeleteScopeAndRemove(
  eng: WorkflowEngine,
  instanceKey: string,
  onDone: () => void,
): Promise<void> {
  const items = eng.instances.getTaskListItems();
  const item = items.find((it) => it.instanceKey === instanceKey);
  const title = item?.title ?? instanceKey;
  const scope = await pickDeleteScope(item);
  if (!scope) {
    return;
  }
  const confirmLabel =
    scope === 'folder'
      ? uiMsg('stagent.delete.confirmFolder')
      : uiMsg('stagent.delete.confirmRecord');
  const detail =
    scope === 'record'
      ? uiMsg('stagent.delete.detailRecord')
      : scope === 'artifacts'
        ? uiMsg('stagent.delete.detailArtifacts')
        : uiMsg(
            'stagent.delete.detailFolder',
            item?.taskWorkspacePath ?? uiMsg('stagent.delete.noWorkspacePath'),
          );
  const pick = await vscode.window.showWarningMessage(
    `${uiMsg('stagent.delete.confirmTitle', title)}\n\n${detail}`,
    { modal: true },
    confirmLabel,
  );
  if (pick !== confirmLabel) {
    return;
  }
  eng.instances.deleteInstance(instanceKey, scope);
  onDone();
}

async function pickDeleteScope(item: TaskListItem | undefined): Promise<DeleteScope | undefined> {
  const folderDesc = item?.taskWorkspacePath
    ? uiMsg('stagent.delete.scopeFolder.description', item.taskWorkspacePath)
    : uiMsg('stagent.delete.scopeFolder.noPath');
  const picks: Array<{ label: string; description: string; scope: DeleteScope }> = [
    {
      label: uiMsg('stagent.delete.scopeRecord.label'),
      description: uiMsg('stagent.delete.scopeRecord.description'),
      scope: 'record',
    },
    {
      label: uiMsg('stagent.delete.scopeArtifacts.label'),
      description: uiMsg('stagent.delete.scopeArtifacts.description'),
      scope: 'artifacts',
    },
    {
      label: uiMsg('stagent.delete.scopeFolder.label'),
      description: folderDesc,
      scope: 'folder',
    },
  ];
  const filtered = item?.taskWorkspacePath ? picks : picks.filter((p) => p.scope !== 'folder');
  const chosen = await vscode.window.showQuickPick(filtered, {
    placeHolder: uiMsg('stagent.delete.scopePlaceholder'),
    matchOnDescription: true,
  });
  return chosen?.scope;
}

export function registerExtensionCommands(
  context: vscode.ExtensionContext,
  runtime: ExtensionRuntime,
  openTaskPanel: () => void,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('stagent.newTask', () => openTaskPanel()),
    vscode.commands.registerCommand('stagent.requirementPolish', () => openTaskPanel()),
    vscode.commands.registerCommand('stagent.openDebugLog', () => {
      void runtime.engine.artifacts.openDebugLog().catch((err) => {
        const mes = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(uiMsg('stagent.error.generic', mes));
      });
    }),
  );
}
