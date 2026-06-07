import * as vscode from 'vscode';

/** VS Code adapter: read `stagent` workspace configuration. */
export function readStagentWorkspaceConfiguration(
  cfg?: vscode.WorkspaceConfiguration,
): vscode.WorkspaceConfiguration {
  return cfg ?? vscode.workspace.getConfiguration('stagent');
}
