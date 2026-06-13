/**
 * M41：引擎 settings 薄读取层 — 集中 vscode 配置读取，便于单测与 Host 工厂注入。
 */
import type * as vscode from 'vscode';
import { getStagentConfiguration } from './settings/getStagentConfiguration';
import type { GlobalDecisionInjectMode } from './GlobalDecisionContext';
import {
  resolveEffectiveDecisionContentLint,
  resolveEffectiveDagMaxParallelism,
  resolveEffectiveGlobalDecisionInjectMode,
  resolveEffectiveInjectApprovedDecisionContext,
  type WorkflowConfigSource,
} from './EffectiveSettings';
import type { GenerationGateSettings } from './WorkflowGenerationOrchestrator';
import {
  readDebugVerbose,
  readRuntimeRule20VerifyEnabled,
  readDecisionContentLintEnabled,
  readMaxManualStageRetries,
  readInjectApprovedDecisionContext,
  readGlobalDecisionInjectMode,
  readDagMaxParallelism,
  readToIssuesHorizontalLayeringFail,
  readDebugFeedbackLoopMode,
  readPlanCompletenessGateEnabled,
  readPlanStructuralRepairMode,
  readStaticAnalysisEnabled,
  readGlossaryEnabled,
  readSdkPathContractLintMode,
  readPythonExportContractLintMode,
  readPythonPypiSymbolLintMode,
  readSandboxEnabled,
  readSandboxVerificationOnly,
  readAutoInsertGlobalArchitectureDecisionEnabled,
  readSplitTestRunBundledCommandsEnabled,
  readCodebaseContextEnabled,
  readCodebaseContextMaxTokens,
  readPromptVersionsEnabled,
  readExperienceInjectOnGenerate,
  readMemoryExperienceStoreEnabled,
  readMemoryMaxExperienceEntries,
  readMaxWorkflowParseRetries,
} from './StagentSettings';
import { readContractPlanPreflightV2Enabled } from './settings/readers/contract';

export function readEngineDebugVerbose(): boolean {
  return readDebugVerbose();
}

export function readEngineRuntimeRule20VerifyEnabled(): boolean {
  return readRuntimeRule20VerifyEnabled();
}

export function readEngineDecisionContentLintEnabled(globalConfig?: WorkflowConfigSource): boolean {
  return resolveEffectiveDecisionContentLint(globalConfig, readDecisionContentLintEnabled());
}

export function readEngineMaxManualStageRetries(): number {
  return readMaxManualStageRetries();
}

export function readEngineInjectApprovedDecisionContext(globalConfig?: WorkflowConfigSource): boolean {
  return resolveEffectiveInjectApprovedDecisionContext(
    globalConfig,
    readInjectApprovedDecisionContext(),
  );
}

export function readEngineGlobalDecisionInjectMode(
  globalConfig?: WorkflowConfigSource,
): GlobalDecisionInjectMode {
  return resolveEffectiveGlobalDecisionInjectMode(globalConfig, readGlobalDecisionInjectMode());
}

export function readEngineDagMaxParallelism(globalConfig?: WorkflowConfigSource): number {
  return resolveEffectiveDagMaxParallelism(globalConfig, readDagMaxParallelism());
}

export function readEngineGlossaryEnabled(): boolean {
  return readGlossaryEnabled();
}

export function readEngineSdkPathContractLintMode(): ReturnType<typeof readSdkPathContractLintMode> {
  return readSdkPathContractLintMode();
}

export function readEnginePythonExportContractLintMode(): ReturnType<
  typeof readPythonExportContractLintMode
> {
  return readPythonExportContractLintMode();
}

export function readEnginePythonPypiSymbolLintMode(): ReturnType<typeof readPythonPypiSymbolLintMode> {
  return readPythonPypiSymbolLintMode();
}

export function readEngineSandboxEnabled(): boolean {
  return readSandboxEnabled();
}

export function readEngineSandboxVerificationOnly(): boolean {
  return readSandboxVerificationOnly();
}

export function readEngineAutoInsertGlobalArchitectureDecision(cfg?: vscode.WorkspaceConfiguration): boolean {
  return readAutoInsertGlobalArchitectureDecisionEnabled(getStagentConfiguration(cfg));
}

export function readEngineSplitTestRunBundledCommands(cfg?: vscode.WorkspaceConfiguration): boolean {
  return readSplitTestRunBundledCommandsEnabled(getStagentConfiguration(cfg));
}

export function readEngineGenerationGates(cfg?: vscode.WorkspaceConfiguration): GenerationGateSettings {
  const c = getStagentConfiguration(cfg);
  return {
    toIssuesHorizontalLayeringFail: readToIssuesHorizontalLayeringFail(),
    debugFeedbackLoopMode: readDebugFeedbackLoopMode(),
    planCompletenessEnabled: readPlanCompletenessGateEnabled(c),
    planStructuralRepairMode: readPlanStructuralRepairMode(c),
    staticAnalysisEnabled: readStaticAnalysisEnabled(c),
    contractPlanPreflightV2: readContractPlanPreflightV2Enabled(c),
  };
}

export function readEngineGenerateWorkflowSettings(cfg?: vscode.WorkspaceConfiguration): {
  readCodebaseContextEnabled: boolean;
  readCodebaseContextMaxTokens: number;
  readPromptVersionsEnabled: boolean;
  readExperienceInjectOnGenerate: boolean;
  readGlossaryEnabled: boolean;
  maxParseAttempts: number;
} {
  const c = getStagentConfiguration(cfg);
  return {
    readCodebaseContextEnabled: readCodebaseContextEnabled(c),
    readCodebaseContextMaxTokens: readCodebaseContextMaxTokens(c),
    readPromptVersionsEnabled: readPromptVersionsEnabled(c),
    readExperienceInjectOnGenerate: readExperienceInjectOnGenerate(c),
    readGlossaryEnabled: readGlossaryEnabled(c),
    maxParseAttempts: readMaxWorkflowParseRetries(c),
  };
}

export function readEngineMemoryExperienceEnabled(cfg?: vscode.WorkspaceConfiguration): boolean {
  return readMemoryExperienceStoreEnabled(getStagentConfiguration(cfg));
}

export function readEngineMemoryMaxExperienceEntries(cfg?: vscode.WorkspaceConfiguration): number {
  return readMemoryMaxExperienceEntries(getStagentConfiguration(cfg));
}
