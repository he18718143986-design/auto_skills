import type { VerifyIssue, VerifyResult } from './Rule20Verify';
import { formatRule20IssueLine } from './Rule20RuntimeGate';
import { GENERATED_WORKFLOW_VIOLATION_PREVIEW_MAX } from './UiListLimits';

/** M20.2.1：violations 阻断 generateWorkflow 时的 reason 文案 */
export function formatRule20ViolationsBlockReason(violations: VerifyIssue[]): string {
  if (violations.length === 0) {
    return 'rule20: no violations';
  }
  const lines = violations.map((v) => formatRule20IssueLine(v, 'violation'));
  const head = lines.slice(0, GENERATED_WORKFLOW_VIOLATION_PREVIEW_MAX).join('; ');
  const tail =
    violations.length > GENERATED_WORKFLOW_VIOLATION_PREVIEW_MAX
      ? ` (+${violations.length - GENERATED_WORKFLOW_VIOLATION_PREVIEW_MAX} more)`
      : '';
  return `generated_workflow_rule20_violations: ${head}${tail}`;
}

export function shouldBlockGenerateOnRule20Violations(
  verifyResult: VerifyResult | undefined,
  runtimeRule20Enabled: boolean,
): boolean {
  return runtimeRule20Enabled && !!verifyResult && verifyResult.violations.length > 0;
}
