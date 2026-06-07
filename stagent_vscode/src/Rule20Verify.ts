/** P0-3：Rule20Verify 门面 — 兼容现有 import 路径。 */
export type {
  VerifyIssue,
  VerifyResult,
  VerifyRule20Options,
  ViolationType,
  WarningType,
} from './rule20/types';

export {
  userHintsMultiModuleOrFullProject,
  hasGlobalArchitectureDecisionStage,
  shouldWarnSoftwareMissingGlobalArchitectureDecision,
  verifyRule20,
} from './rule20/index';
