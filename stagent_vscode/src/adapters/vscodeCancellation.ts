import * as vscode from 'vscode';

/** VS Code adapter: detect VS Code cancellation errors. */
export function isVscodeCancellationError(error: unknown): boolean {
  return error instanceof vscode.CancellationError;
}
