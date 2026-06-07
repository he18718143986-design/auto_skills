import * as vscode from 'vscode';

/** Thin UI adapter so pure-logic callers stay host-free and unit-testable. */
export type ConfirmDialog = (
  message: string,
  continueLabel: string,
  cancelLabel: string,
) => Promise<string | undefined>;

export const vscodeConfirmDialog: ConfirmDialog = (message, continueLabel, cancelLabel) =>
  Promise.resolve(vscode.window.showInformationMessage(message, continueLabel, cancelLabel));
