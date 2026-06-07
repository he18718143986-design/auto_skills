import * as vscode from 'vscode';

/** VS Code adapter: surface a warning toast to the user. */
export function showWarningToast(message: string): Thenable<string | undefined> {
  return vscode.window.showWarningMessage(message);
}
