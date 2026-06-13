import {
  CONFIDENCE_LEVEL_HIGH_MIN,
  CONFIDENCE_LEVEL_MEDIUM_MIN,
} from './ConfidenceBands';
import { qualityIssueMsg } from './l10n/qualityMsg';
import { isImplStageId } from './workflow/StageIdPatterns';
import { isLlmTextTool } from './workflow/StageToolKinds';
import { PRIMARY_DECISION_OUTPUT_KEY } from './WorkflowOutputKeys';
import type { Stage, WorkflowDefinition } from './WorkflowDefinition';
import { verifyDecisionRecord, type DecisionViolation } from './DecisionRecordVerify';
import { isHollowImplOutput } from './ImplOutputGuard';
import { stripFenceMarkersFromBlock } from './markdown/MarkdownFenceUtils';
import {
  OUTPUT_MIN_LEN_DECISION,
  OUTPUT_MIN_LEN_IMPL,
  OUTPUT_MIN_LEN_NON_CODE_ARTIFACT,
  OUTPUT_MIN_LEN_OTHER,
} from './workflow/OutputLengthThresholds';
import { SCORER_SHORT_OUTPUT_PENALTY_CAP } from './workflow/ScorerPenaltyCaps';

/** 写入 StageRuntime.outputs，供 M15.2 ConfidenceScorer 等读取 */
export const QUALITY_SCORE_OUTPUT_KEY = '_qualityScore';

/** 过短输出等对 completeness 维度的分数上限 */
export const OUTPUT_QUALITY_SHORT_OUTPUT_CAP = SCORER_SHORT_OUTPUT_PENALTY_CAP;
const OUTPUT_QUALITY_TRUNCATED_CAP = 0.35;
const OUTPUT_QUALITY_NO_DECLARED_OUTPUT_SCORE = 0.5;
const OUTPUT_QUALITY_MISSING_DECISION_KEY_SCORE = 0.2;
const OUTPUT_QUALITY_THIN_PROMPT_CAP = 0.85;
const OUTPUT_QUALITY_UNBALANCED_BRACES_SCORE = 0.7;
const OUTPUT_QUALITY_NON_CODE_ARTIFACT_SCORE = 0.95;
const OUTPUT_QUALITY_HOLLOW_IMPL_SCORE = 0.1;

const WEIGHT_DECISION_COMPLETENESS = 0.15;
const WEIGHT_DECISION_CODE_VALIDITY = 0.05;
const WEIGHT_DECISION_SPEC = 0.1;
const WEIGHT_DECISION_QUALITY = 0.7;
const WEIGHT_IMPL_COMPLETENESS = 0.25;
const WEIGHT_IMPL_CODE_VALIDITY = 0.4;
const WEIGHT_IMPL_SPEC = 0.2;
const WEIGHT_IMPL_DECISION = 0.15;
const WEIGHT_DEFAULT_COMPLETENESS = 0.4;
const WEIGHT_DEFAULT_CODE_VALIDITY = 0.2;
const WEIGHT_DEFAULT_SPEC = 0.3;
const WEIGHT_DEFAULT_DECISION = 0.1;
const DECISION_VIOLATION_PENALTY_PER = 0.22;
const DECISION_VIOLATION_PENALTY_CAP = 0.85;
const DECISION_VIOLATION_SCORE_FLOOR = 0.05;

export type QualityRecommendation = 'approve' | 'review' | 'retry';

export interface QualityIssue {
  code: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

export interface QualityScore {
  overall: number;
  dimensions: {
    completeness: number;
    codeValidity: number;
    specCompliance: number;
    decisionQuality: number;
  };
  issues: QualityIssue[];
  recommendation: QualityRecommendation;
}

const TRUNCATION_MARKERS = [/\[内容已截断/, /\[\s*truncated\s*\]/i];

const NON_CODE_ARTIFACT_EXT = /\.(txt|env|ini|cfg|conf|toml|md|csv|tsv|yaml|yml|json|lock|properties)$/i;

/**
 * 该阶段产出的是「非代码」文本/配置/数据落盘文件（requirements.txt、.env、config.yaml、*.json 等）。
 * 这类产物天然简短且**不需要** ``` 代码块，按代码标准（最小长度 / 必含代码块）扣分会造成误判
 * （如 requirements.txt 被判 critical 触发不必要的暂停）。
 */
export function isNonCodeArtifactStage(stage: Stage): boolean {
  const tc = stage.toolConfig;
  if (tc.type !== 'llm-text') {
    return false;
  }
  const out = tc.writeOutputToFile?.trim().toLowerCase();
  if (!out) {
    return false;
  }
  const base = out.split('/').pop() ?? out;
  if (base === 'requirements.txt' || base === '.env' || base.startsWith('.env.')) {
    return true;
  }
  return NON_CODE_ARTIFACT_EXT.test(base);
}

function primaryDeclaredOutputKey(stage: Stage): string | undefined {
  return stage.outputs[0]?.key;
}

function scoreCompleteness(text: string, stage: Stage): { score: number; issues: QualityIssue[] } {
  const issues: QualityIssue[] = [];
  const trimmed = text.trim();

  if (!trimmed) {
    issues.push({
      code: 'empty-output',
      severity: 'error',
      message: qualityIssueMsg('empty-output'),
    });
    return { score: 0, issues };
  }

  let score = 1;
  if (TRUNCATION_MARKERS.some((re) => re.test(text))) {
    score = OUTPUT_QUALITY_TRUNCATED_CAP;
    issues.push({
      code: 'truncated-output',
      severity: 'warning',
      message: qualityIssueMsg('truncated-output'),
    });
  }

  const minChars = stage.isDecisionStage
    ? OUTPUT_MIN_LEN_DECISION
    : isNonCodeArtifactStage(stage)
      ? OUTPUT_MIN_LEN_NON_CODE_ARTIFACT
      : isImplStageId(stage.id)
        ? OUTPUT_MIN_LEN_IMPL
        : OUTPUT_MIN_LEN_OTHER;
  if (trimmed.length < minChars) {
    score = Math.min(score, OUTPUT_QUALITY_SHORT_OUTPUT_CAP);
    issues.push({
      code: 'short-output',
      severity: 'warning',
      message: qualityIssueMsg('short-output', trimmed.length, minChars),
    });
  }

  return { score, issues };
}

function scoreCodeValidity(text: string, stage: Stage): { score: number; issues: QualityIssue[] } {
  const issues: QualityIssue[] = [];

  if (stage.isDecisionStage) {
    return { score: 1, issues };
  }

  if (isImplStageId(stage.id)) {
    if (!text.trim()) {
      issues.push({
        code: 'empty-impl-output',
        severity: 'error',
        message: qualityIssueMsg('empty-impl-output'),
      });
      return { score: 0, issues };
    }
    if (isHollowImplOutput(text)) {
      issues.push({
        code: 'hollow-impl-output',
        severity: 'error',
        message: qualityIssueMsg('hollow-impl-output'),
      });
      return { score: OUTPUT_QUALITY_HOLLOW_IMPL_SCORE, issues };
    }
    if (isNonCodeArtifactStage(stage)) {
      return { score: OUTPUT_QUALITY_NON_CODE_ARTIFACT_SCORE, issues };
    }
    if (!/```/.test(text) && text.trim().length > 0) {
      issues.push({
        code: 'missing-code-fence',
        severity: 'warning',
        message: qualityIssueMsg('missing-code-fence'),
      });
      return { score: CONFIDENCE_LEVEL_MEDIUM_MIN, issues };
    }
    const fences = text.match(/```[\s\S]*?```/g) ?? [];
    if (fences.length > 0) {
      const unbalanced = fences.some((block) => {
        const inner = stripFenceMarkersFromBlock(block);
        const open = (inner.match(/\{/g) ?? []).length;
        const close = (inner.match(/\}/g) ?? []).length;
        return open > 0 && close > 0 && Math.abs(open - close) > 2;
      });
      if (unbalanced) {
        issues.push({
          code: 'unbalanced-braces',
          severity: 'info',
          message: qualityIssueMsg('unbalanced-braces'),
        });
        return { score: OUTPUT_QUALITY_UNBALANCED_BRACES_SCORE, issues };
      }
    }
    return { score: OUTPUT_QUALITY_NON_CODE_ARTIFACT_SCORE, issues };
  }

  return { score: 1, issues };
}

function scoreSpecCompliance(text: string, stage: Stage): { score: number; issues: QualityIssue[] } {
  const issues: QualityIssue[] = [];
  const primary = primaryDeclaredOutputKey(stage);

  if (!primary) {
    issues.push({
      code: 'no-declared-output',
      severity: 'warning',
      message: qualityIssueMsg('no-declared-output'),
    });
    return { score: OUTPUT_QUALITY_NO_DECLARED_OUTPUT_SCORE, issues };
  }

  if (stage.isDecisionStage) {
    const hasDecisionKey = stage.outputs.some((o) => o.key === PRIMARY_DECISION_OUTPUT_KEY);
    if (!hasDecisionKey) {
      issues.push({
        code: 'missing-decision-record-key',
        severity: 'error',
        message: qualityIssueMsg('missing-decision-record-key'),
      });
      return { score: OUTPUT_QUALITY_MISSING_DECISION_KEY_SCORE, issues };
    }
    if (primary !== PRIMARY_DECISION_OUTPUT_KEY) {
      issues.push({
        code: 'non-primary-decision-key',
        severity: 'info',
        message: qualityIssueMsg('non-primary-decision-key', primary),
      });
    }
  }

  if (!isLlmTextTool(stage.tool)) {
    return { score: 1, issues };
  }

  const tc = stage.toolConfig;
  const systemPrompt = tc.type === 'llm-text' ? (tc.systemPrompt ?? '') : '';
  if (tc.type === 'llm-text' && systemPrompt.trim().length < 20) {
    issues.push({
      code: 'thin-system-prompt',
      severity: 'info',
      message: qualityIssueMsg('thin-system-prompt'),
    });
    return { score: OUTPUT_QUALITY_THIN_PROMPT_CAP, issues };
  }

  if (!text.trim()) {
    return { score: 0, issues };
  }

  return { score: 1, issues };
}

function decisionViolationsToIssues(violations: DecisionViolation[]): QualityIssue[] {
  return violations.map((v) => ({
    code: `decision-${v.code}`,
    severity: 'error' as const,
    message: `${v.invariantId}: ${v.message}`,
  }));
}

function scoreDecisionDimension(text: string, stage: Stage): { score: number; issues: QualityIssue[] } {
  if (!stage.isDecisionStage) {
    return { score: 1, issues: [] };
  }

  const verify = verifyDecisionRecord(text);
  if (verify.ok) {
    return { score: 1, issues: [] };
  }

  const issues = decisionViolationsToIssues(verify.violations);
  const penalty = Math.min(
    DECISION_VIOLATION_PENALTY_CAP,
    verify.violations.length * DECISION_VIOLATION_PENALTY_PER,
  );
  return { score: Math.max(DECISION_VIOLATION_SCORE_FLOOR, 1 - penalty), issues };
}

function weightedOverall(
  dimensions: QualityScore['dimensions'],
  stage: Stage,
): number {
  if (stage.isDecisionStage) {
    return (
      dimensions.completeness * WEIGHT_DECISION_COMPLETENESS +
      dimensions.codeValidity * WEIGHT_DECISION_CODE_VALIDITY +
      dimensions.specCompliance * WEIGHT_DECISION_SPEC +
      dimensions.decisionQuality * WEIGHT_DECISION_QUALITY
    );
  }
  if (isImplStageId(stage.id)) {
    return (
      dimensions.completeness * WEIGHT_IMPL_COMPLETENESS +
      dimensions.codeValidity * WEIGHT_IMPL_CODE_VALIDITY +
      dimensions.specCompliance * WEIGHT_IMPL_SPEC +
      dimensions.decisionQuality * WEIGHT_IMPL_DECISION
    );
  }
  return (
    dimensions.completeness * WEIGHT_DEFAULT_COMPLETENESS +
    dimensions.codeValidity * WEIGHT_DEFAULT_CODE_VALIDITY +
    dimensions.specCompliance * WEIGHT_DEFAULT_SPEC +
    dimensions.decisionQuality * WEIGHT_DEFAULT_DECISION
  );
}

function deriveRecommendation(overall: number, issues: QualityIssue[]): QualityRecommendation {
  const hasError = issues.some((i) => i.severity === 'error');
  if (hasError && overall < 0.5) {
    return 'retry';
  }
  if (hasError || overall < CONFIDENCE_LEVEL_MEDIUM_MIN) {
    return 'review';
  }
  if (overall >= CONFIDENCE_LEVEL_HIGH_MIN) {
    return 'approve';
  }
  return 'review';
}

/**
 * 针对 llm-text 阶段输出的静态质量评分（纯规则，无 LLM）。
 * `definition` 预留供后续按 taskType / globalConfig 加权（M15+）。
 */
export function scoreStatically(
  stage: Stage,
  output: string,
  _definition: WorkflowDefinition,
): QualityScore {
  const text = typeof output === 'string' ? output : String(output ?? '');

  const c = scoreCompleteness(text, stage);
  const v = scoreCodeValidity(text, stage);
  const s = scoreSpecCompliance(text, stage);
  const d = scoreDecisionDimension(text, stage);

  const dimensions = {
    completeness: c.score,
    codeValidity: v.score,
    specCompliance: s.score,
    decisionQuality: d.score,
  };

  const issues = [...c.issues, ...v.issues, ...s.issues, ...d.issues];
  const overall = Math.round(weightedOverall(dimensions, stage) * 1000) / 1000;
  const recommendation = deriveRecommendation(overall, issues);

  return {
    overall,
    dimensions,
    issues,
    recommendation,
  };
}
