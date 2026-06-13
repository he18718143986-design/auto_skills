import type * as vscode from 'vscode';
import type { QualityGateExecutionHost } from '../QualityGate';
import {
  analysisResultsToWarningLines,
  buildDefaultWorkspaceChecks,
  runStaticAnalysis,
} from '../StaticAnalysisPipeline';
import type { QualityGateHostInput } from './types';
import { qualityGateSettingsReaders } from './quality-gate-settings';

export function buildQualityGateExecutionHost(
  engine: QualityGateHostInput,
  targetPanel: vscode.WebviewPanel,
): QualityGateExecutionHost {
  const readers = qualityGateSettingsReaders;
  return {
    getWorkspaceRootAbsolute: () => engine.getWorkspaceRootAbsolute(),
    resolveCodeRunnerCwd: (cfg, instanceKey) => engine.resolveCodeRunnerCwd(cfg, instanceKey),
    runCodeRunner: (cfg, instanceKey, stageId) =>
      engine.runCodeRunner(cfg, instanceKey, stageId, targetPanel),
    runWorkspaceContractLint: () => engine.runWorkspaceContractLint(),
    runSdkPathContractHardGate: () => engine.runSdkPathContractHardGate(),
    runPythonExportContractHardGate: () => engine.runPythonExportContractHardGate(),
    runPythonPypiSymbolHardGate: () => engine.runPythonPypiSymbolHardGate(),
    runPostImplStaticAnalysis: async () => {
      if (!readers.readStaticAnalysisEnabled()) {
        return [];
      }
      const ws = engine.getWorkspaceRootAbsolute();
      if (!ws) {
        return [];
      }
      const checks = buildDefaultWorkspaceChecks(ws);
      if (checks.length === 0) {
        return [];
      }
      const results = await runStaticAnalysis(checks, ws);
      return analysisResultsToWarningLines(results);
    },
    readRedGreenGateMode: () => readers.readRedGreenGateMode(),
    readDebugFeedbackLoopRuntimeHard: () => readers.readDebugFeedbackLoopRuntimeHard(),
    readTestRunPreflightEnabled: () => readers.readTestRunPreflightEnabled(),
    readTestRunAutoNpmInstallEnabled: () => readers.readTestRunAutoNpmInstallEnabled(),
    readSdkPathContractLintMode: () => readers.readSdkPathContractLintMode(),
    readPythonExportContractLintMode: () => readers.readPythonExportContractLintMode(),
    readPythonPypiSymbolLintMode: () => readers.readPythonPypiSymbolLintMode(),
    readStaticAnalysisEnabled: () => readers.readStaticAnalysisEnabled(),
  };
}
