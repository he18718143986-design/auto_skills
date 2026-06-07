import type { SdkPathContractIssue } from './SdkPathContractLint';
import type { WorkspaceLintContext } from './WorkflowEngineWorkspaceLint';
import {
  runSdkPathContractHardGate as runSdkPathContractHardGateFromLint,
  runWorkspaceContractLint as runWorkspaceContractLintFromLint,
} from './WorkflowEngineWorkspaceLint';

export interface StageLintDelegateDeps {
  workspaceLintContext: () => WorkspaceLintContext;
}

export class StageLintDelegate {
  constructor(private readonly deps: StageLintDelegateDeps) {}

  runWorkspaceContractLint(): Promise<string[]> {
    return runWorkspaceContractLintFromLint(this.deps.workspaceLintContext());
  }

  runSdkPathContractHardGate(): Promise<SdkPathContractIssue | null> {
    return runSdkPathContractHardGateFromLint(this.deps.workspaceLintContext());
  }
}
