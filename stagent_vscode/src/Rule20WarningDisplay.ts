/**
 * 将 `workflowGenerated.warnings` 中的机器可读 token（M14.4 / I-23）
 * 转为确认页可读的短句；原始 token 仍保留在 `warnings` 供日志/脚本解析。
 */

import { contractLabelKey, rule20DisplayLabel } from './l10n/rule20Msg';
import { lintMsg } from './l10n/lintMsg';
import {
  BUILTIN_WARNING_RESTORED_FROM_PERSISTENCE,
  BUILTIN_WARNING_STAGE_COUNT_NEAR_LIMIT,
  parseWorkflowWarningLine,
  type ParsedWorkflowWarning,
} from './lint/WorkflowWarningTokens';
import { uiMsg } from './l10n/uiStrings';
import { WORKFLOW_LEVEL_STAGE_ID } from './workflow/WorkflowLevelIds';

export type { ParsedWorkflowWarning } from './lint/WorkflowWarningTokens';
export { parseWorkflowWarningLine } from './lint/WorkflowWarningTokens';

const RULE20_DISPLAY_TYPES = new Set([
  'missing-decision-stage',
  'broken-naming-pair',
  'missing-decisionRecord-source',
  'missing-constraint-prompt',
  'test-run-must-use-code-runner',
  'test-run-imports-missing-artifact',
  'software-missing-global-architecture-decision',
  'global-architecture-decision-auto-inserted',
  'impl-decision-not-paired',
  'decision-not-paired',
  'exposeAssumptions-exemption',
  'model-tier-downgrade',
  'prototype-missing-verification-stage',
  'prototype-missing-success-criteria',
  'prototype-impl-missing-file-read-followup',
  'debug-missing-reproduce-stage',
  'debug-missing-hypothesis-stage',
  'debug-missing-verification-stage',
  'debug-impl-missing-decision-source',
  'debug-feedback-loop-not-first',
  'horizontal-tdd',
  'to-issues-missing-chain',
  'to-issues-missing-verification',
  'to-issues-monolithic-impl-naming',
  'to-issues-high-hitl-ratio',
  'to-issues-horizontal-layering',
  'refactor-missing-decision-stage',
  'refactor-missing-verification-stage',
  'refactor-monolithic-impl-naming',
  'dag-unreachable-from-entry',
  'dag-dependency-cycle-hint',
  BUILTIN_WARNING_STAGE_COUNT_NEAR_LIMIT,
  BUILTIN_WARNING_RESTORED_FROM_PERSISTENCE,
]);

const CONTRACT_DISPLAY_TYPES = new Set([
  'sample-mock-source-unshared',
  'impl-missing-decision-source',
  'weak-integration-assertion',
  'cross-file-key-mismatch',
  'sample-header-unmapped',
  'non-canonical-key',
  'test-no-assertion',
  'test-tautological-assertion',
  'test-tests-implementation',
]);

function labelForRule20Type(type: string): string {
  if (RULE20_DISPLAY_TYPES.has(type)) {
    return rule20DisplayLabel(type);
  }
  return type;
}

function labelForContractType(type: string): string {
  if (CONTRACT_DISPLAY_TYPES.has(type)) {
    return lintMsg(contractLabelKey(type));
  }
  return type;
}

function stageSuffix(stageId: string): string {
  return stageId && stageId !== WORKFLOW_LEVEL_STAGE_ID ? `（${stageId}）` : '';
}

/** 单条 warning token → 确认页展示文案 */
export function formatWorkflowWarningForDisplay(line: string): string {
  const parsed = parseWorkflowWarningLine(line);
  if (!parsed) {
    return line;
  }
  if (parsed.kind === 'builtin') {
    return labelForRule20Type(parsed.type);
  }
  if (parsed.kind === 'contract') {
    const cLabel = labelForContractType(parsed.type);
    if (parsed.type === 'cross-file-key-mismatch') {
      return `${uiMsg('stagent.rule20.display.contractPrefix')} ${cLabel}：${parsed.stageId}`;
    }
    return `${uiMsg('stagent.rule20.display.contractPrefix')} ${cLabel}${stageSuffix(parsed.stageId)}`;
  }
  const label = labelForRule20Type(parsed.type);
  const suffix = stageSuffix(parsed.stageId);
  if (parsed.kind === 'rule20-violation') {
    return `${uiMsg('stagent.rule20.display.violationPrefix')} ${label}${suffix}`;
  }
  return `${uiMsg('stagent.rule20.display.softPrefix')} ${label}${suffix}`;
}

export function formatWorkflowGeneratedWarningsForDisplay(warnings: string[] | undefined): string[] {
  if (!warnings?.length) {
    return [];
  }
  return warnings.map(formatWorkflowWarningForDisplay);
}

/** 供 generateWorkflow 调试日志：violations / soft warnings 计数摘要 */
export function summarizeRule20VerifyForLog(verifyResult: {
  violations: unknown[];
  warnings: unknown[];
  passed: boolean;
}): { passed: boolean; violationCount: number; warningCount: number } {
  return {
    passed: verifyResult.passed,
    violationCount: verifyResult.violations.length,
    warningCount: verifyResult.warnings.length,
  };
}
