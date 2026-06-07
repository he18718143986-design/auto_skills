import {
  readArchitectureDepthScoringEnabled,
  readConfidencePauseThreshold,
  readContractNodePauseThreshold,
  readDebugFeedbackLoopRuntimeHard,
  readPauseContractNodesEnabled,
  readRedGreenGateMode,
  readSdkPathContractLintMode,
  readStaticAnalysisEnabled,
  readTestRunFailurePlaybookEnabled,
  readTestRunPreflightEnabled,
  readTestRunAutoNpmInstallEnabled,
} from '../StagentSettings';

export const qualityGateSettingsReaders = {
  readRedGreenGateMode,
  readDebugFeedbackLoopRuntimeHard,
  readTestRunPreflightEnabled,
  readTestRunAutoNpmInstallEnabled,
  readSdkPathContractLintMode,
  readStaticAnalysisEnabled,
  readConfidencePauseThreshold,
  readContractNodePauseThreshold,
  readPauseContractNodesEnabled,
  readArchitectureDepthScoringEnabled,
  readTestRunFailurePlaybookEnabled,
};
