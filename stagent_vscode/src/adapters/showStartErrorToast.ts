import * as vscode from 'vscode';

/** VS Code adapter: surface a start-workflow validation error to the user. */
export function showStartErrorToast(message: string): Thenable<string | undefined> {
  return vscode.window.showErrorMessage(message);
}
