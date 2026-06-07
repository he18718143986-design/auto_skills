import type * as vscode from 'vscode';
import { readStagentWorkspaceConfiguration } from '../adapters/vscodeConfigurationReader';

/** vscode `stagent` 工作区配置；可选注入 cfg 便于单测。 */
export function getStagentConfiguration(cfg?: vscode.WorkspaceConfiguration): vscode.WorkspaceConfiguration {
  return readStagentWorkspaceConfiguration(cfg);
}
