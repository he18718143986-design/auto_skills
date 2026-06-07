import * as vscode from 'vscode';

/** VS Code adapter: first workspace folder path, if any. */
export function readWorkspaceFolderPath(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}
