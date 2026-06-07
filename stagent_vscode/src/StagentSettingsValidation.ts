import type * as vscode from 'vscode';
import { validateExecSettings } from './settings/validators/execValidators';
import { formatSettingsValidationReport } from './settings/validators/formatReport';
import { validateGatesSettings } from './settings/validators/gatesOrchestrator';
import { validateLlmSettings } from './settings/validators/llmValidators';
import { mergeValidationIssues } from './settings/validators/mergeValidationIssues';
import { validateProfileSettings } from './settings/validators/profileValidators';
import type { SettingsValidationIssue } from './settings/validators/types';

export type { SettingsValidationIssue, SettingsValidationSeverity } from './settings/validators/types';

export function validateSettings(cfg?: vscode.WorkspaceConfiguration): SettingsValidationIssue[] {
  return mergeValidationIssues([
    validateGatesSettings(cfg),
    validateLlmSettings(cfg),
    validateExecSettings(cfg),
    validateProfileSettings(cfg),
  ]);
}

export { formatSettingsValidationReport };
