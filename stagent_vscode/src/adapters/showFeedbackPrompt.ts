import * as vscode from 'vscode';

/** VS Code adapter: optional feedback prompt with external form link. */
export async function showFeedbackPrompt(
  message: string,
  actionLabel: string,
  formUrl: string,
): Promise<void> {
  const choice = await vscode.window.showInformationMessage(message, actionLabel);
  if (choice === actionLabel) {
    void vscode.env.openExternal(vscode.Uri.parse(formUrl));
  }
}
