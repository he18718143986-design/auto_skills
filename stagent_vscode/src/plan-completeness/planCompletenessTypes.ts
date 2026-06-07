export type PlanCompletenessViolationType =
  | 'missing-verification-stage'
  | 'missing-main-assembly'
  | 'missing-test-infrastructure'
  | 'test-infra-path-mismatch'
  | 'missing-self-heal-chain'
  | 'multi-file-prompt-mismatch'
  | 'test-stack-nestjs-mismatch'
  | 'upstream-fix-no-impl'
  | 'upstream-fix-stack-routing'
  | 'test-write-import-not-in-plan'
  | 'test-write-import-undeclared';

export interface PlanCompletenessIssue {
  type: PlanCompletenessViolationType;
  message: string;
}
