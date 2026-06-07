import * as vscode from 'vscode';
import { formatSettingsValidationReport, validateSettings } from './StagentSettings';
import { uiMsg } from './l10n/uiStrings';
import { getStagentConfiguration } from './settings/getStagentConfiguration';

let settingsValidationChannel: vscode.OutputChannel | undefined;

export function bootstrapExtensionSettings(context: vscode.ExtensionContext): void {
  settingsValidationChannel = vscode.window.createOutputChannel('Stagent Settings');
  context.subscriptions.push(settingsValidationChannel);
  runSettingsValidation();
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('stagent')) {
        runSettingsValidation();
      }
    }),
  );
}

export function runSettingsValidation(): void {
  if (!settingsValidationChannel) {
    return;
  }
  const cfg = getStagentConfiguration();
  const issues = validateSettings(cfg);
  settingsValidationChannel.clear();
  settingsValidationChannel.appendLine(formatSettingsValidationReport(issues));
  const errors = issues.filter((i) => i.severity === 'error');
  if (errors.length > 0) {
    void vscode.window.showWarningMessage(uiMsg('stagent.warn.settingsValidation', errors.length));
  }
}
