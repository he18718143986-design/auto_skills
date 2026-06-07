import * as vscode from 'vscode';

/** P0-5：Stagent 用户可见 OutputChannel 懒创建。 */
export function getOrCreateStagentOutputChannel(
  context: vscode.ExtensionContext,
  existing?: vscode.OutputChannel,
): vscode.OutputChannel {
  if (existing) {
    return existing;
  }
  const channel = vscode.window.createOutputChannel('Stagent');
  context.subscriptions.push(channel);
  return channel;
}
