import type { VerifyIssue, VerifyResult } from './Rule20Verify';
import { formatRule20IssueLine } from './Rule20RuntimeGate';

/** M20.2.1：violations 阻断 generateWorkflow 时的 reason 文案 */
export function formatRule20ViolationsBlockReason(violations: VerifyIssue[]): string {
  if (violations.length === 0) {
    return 'rule20: no violations';
  }
  const lines = violations.map((v) => formatRule20IssueLine(v, 'violation'));
  const head = lines.slice(0, 3).join('; ');
  const tail = violations.length > 3 ? ` (+${violations.length - 3} more)` : '';
  return `generated_workflow_rule20_violations: ${head}${tail}`;
}

export function shouldBlockGenerateOnRule20Violations(
  verifyResult: VerifyResult | undefined,
  runtimeRule20Enabled: boolean,
): boolean {
  return runtimeRule20Enabled && !!verifyResult && verifyResult.violations.length > 0;
}
