import type * as vscode from 'vscode';
import { readConfigBooleanDefaultTrue, readConfigBooleanStrictTrue } from './readConfigHelpers';

export function readContractInfraChainV2Enabled(cfg?: vscode.WorkspaceConfiguration): boolean {
  return readConfigBooleanDefaultTrue(cfg, 'contract.infraChainV2');
}

export function readContractPlanPreflightV2Enabled(cfg?: vscode.WorkspaceConfiguration): boolean {
  return readConfigBooleanStrictTrue(cfg, 'contract.planPreflightV2');
}

export function readContractCommitmentsEnabled(cfg?: vscode.WorkspaceConfiguration): boolean {
  return readConfigBooleanStrictTrue(cfg, 'contract.commitments');
}

export function readContractCommitmentsLlmFallbackEnabled(cfg?: vscode.WorkspaceConfiguration): boolean {
  return readConfigBooleanStrictTrue(cfg, 'contract.commitmentsLlmFallback');
}

export function readContractRuntimePreflightV2Enabled(cfg?: vscode.WorkspaceConfiguration): boolean {
  return readConfigBooleanStrictTrue(cfg, 'contract.runtimePreflightV2');
}

export function readContractBoundExecutionEnabled(cfg?: vscode.WorkspaceConfiguration): boolean {
  return readConfigBooleanStrictTrue(cfg, 'contract.boundExecution');
}

export function readContractDiagnosticRouterEnabled(cfg?: vscode.WorkspaceConfiguration): boolean {
  return readConfigBooleanStrictTrue(cfg, 'contract.diagnosticRouter');
}
