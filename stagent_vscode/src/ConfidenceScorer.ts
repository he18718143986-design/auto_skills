import {
  CONFIDENCE_LEVEL_LOW_MIN,
  CONFIDENCE_LEVEL_MEDIUM_MIN,
  scoreToConfidenceLevel,
} from './ConfidenceBands';
import { confidenceReasonMsg } from './l10n/qualityMsg';
import type { Stage, StageRuntime } from './WorkflowDefinition';
import { isNonCodeArtifactStage, type QualityScore } from './OutputQualityScorer';
import { CONFIDENCE_OUTPUT_KEY } from './WorkflowOutputKeys';
import {
  OUTPUT_MIN_LEN_NON_CODE_ARTIFACT,
  minOutputLengthForStageKind,
} from './workflow/OutputLengthThresholds';
import { SCORER_SHORT_OUTPUT_PENALTY_CAP } from './workflow/ScorerPenaltyCaps';
import { classifyStageKind, type StageKind } from './workflow/stageClassification';

export { CONFIDENCE_OUTPUT_KEY };

export type ConfidenceStageType = StageKind;

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'critical';

export interface ConfidenceSignals {
  qualityScore?: QualityScore;
  retryCount: number;
  stageType: ConfidenceStageType;
  outputLength: number;
  hasCodeBlock: boolean;
  matchesExpectedOutputKey: boolean;
  /** 产出非代码文本/配置文件（requirements.txt、.env、*.yaml 等）；这类产物豁免「过短 / 缺代码块」扣分 */
  isNonCodeArtifact?: boolean;
  /** M17 FailurePatternAnalyzer 注入；M15.2 仅作降权 stub */
  priorFailurePattern?: string;
}

export interface ConfidenceResult {
  score: number;
  level: ConfidenceLevel;
  reasons: string[];
}

/** 无质量分时的中性先验（与 NLS `stagent.confidence.reason.noQualityScore` 一致）。 */
export const CONFIDENCE_PRIOR_NEUTRAL = 0.65;

const RETRY_PENALTY = 0.12;
const PRIOR_FAILURE_PENALTY = 0.15;
const OUTPUT_KEY_MISMATCH_PENALTY = 0.2;
const CONFIDENCE_QUALITY_ERROR_PENALTY_CAP = 0.25;
const CONFIDENCE_QUALITY_ERROR_PENALTY_PER = 0.08;
const CONFIDENCE_RETRY_PENALTY_CAP = SCORER_SHORT_OUTPUT_PENALTY_CAP;
const CONFIDENCE_REVIEW_SCORE_CAP = CONFIDENCE_LEVEL_MEDIUM_MIN + 0.03;
const CONFIDENCE_OUTPUT_TOO_SHORT_PENALTY = 0.18;
const CONFIDENCE_IMPL_MISSING_CODE_BLOCK_PENALTY = 0.12;
const CONFIDENCE_NON_CODE_ARTIFACT_MIN_LEN = OUTPUT_MIN_LEN_NON_CODE_ARTIFACT;

export function classifyStageType(stage: Stage): ConfidenceStageType {
  return classifyStageKind(stage);
}

export function buildConfidenceSignals(
  stage: Stage,
  runtime: StageRuntime,
  actualOutputKey: string,
  outputText: string,
  qualityScore?: QualityScore,
  opts?: { priorFailurePattern?: string },
): ConfidenceSignals {
  const expectedPrimary = stage.outputs[0]?.key;
  const text = typeof outputText === 'string' ? outputText : String(outputText ?? '');
  return {
    qualityScore,
    retryCount: runtime.retryCount ?? 0,
    stageType: classifyStageType(stage),
    outputLength: text.trim().length,
    hasCodeBlock: /```/.test(text),
    matchesExpectedOutputKey: expectedPrimary === undefined || actualOutputKey === expectedPrimary,
    isNonCodeArtifact: isNonCodeArtifactStage(stage),
    priorFailurePattern: opts?.priorFailurePattern,
  };
}

function minLengthForStageType(stageType: ConfidenceStageType): number {
  return minOutputLengthForStageKind(stageType);
}

export { scoreToConfidenceLevel } from './ConfidenceBands';

/**
 * 综合质量分、重试次数、输出形态等信号，计算 0–1 置信度（越低越需人工介入）。
 * 纯函数；不读取 vscode / 磁盘。
 */
export function computeConfidence(signals: ConfidenceSignals): ConfidenceResult {
  const reasons: string[] = [];
  let score = signals.qualityScore?.overall ?? CONFIDENCE_PRIOR_NEUTRAL;

  if (signals.qualityScore) {
    if (signals.qualityScore.recommendation === 'retry') {
      score = Math.min(score, CONFIDENCE_LEVEL_LOW_MIN);
      reasons.push(confidenceReasonMsg('qualityRetry'));
    } else if (signals.qualityScore.recommendation === 'review') {
      score = Math.min(score, CONFIDENCE_REVIEW_SCORE_CAP);
      reasons.push(confidenceReasonMsg('qualityReview'));
    }
    const errorIssues = signals.qualityScore.issues.filter((i) => i.severity === 'error');
    if (errorIssues.length > 0) {
      score -= Math.min(
        CONFIDENCE_QUALITY_ERROR_PENALTY_CAP,
        errorIssues.length * CONFIDENCE_QUALITY_ERROR_PENALTY_PER,
      );
      reasons.push(confidenceReasonMsg('qualityErrors', errorIssues.length));
    }
  } else {
    reasons.push(confidenceReasonMsg('noQualityScore'));
  }

  if (signals.retryCount > 0) {
    const penalty = Math.min(CONFIDENCE_RETRY_PENALTY_CAP, signals.retryCount * RETRY_PENALTY);
    score -= penalty;
    reasons.push(confidenceReasonMsg('manualRetries', signals.retryCount));
  }

  if (!signals.matchesExpectedOutputKey) {
    score -= OUTPUT_KEY_MISMATCH_PENALTY;
    reasons.push(confidenceReasonMsg('outputKeyMismatch'));
  }

  const minLen = signals.isNonCodeArtifact
    ? CONFIDENCE_NON_CODE_ARTIFACT_MIN_LEN
    : minLengthForStageType(signals.stageType);
  if (signals.outputLength < minLen) {
    score -= CONFIDENCE_OUTPUT_TOO_SHORT_PENALTY;
    reasons.push(
      confidenceReasonMsg('outputTooShort', signals.outputLength, signals.stageType, minLen),
    );
  }

  if (
    signals.stageType === 'impl' &&
    !signals.isNonCodeArtifact &&
    !signals.hasCodeBlock &&
    signals.outputLength > 0
  ) {
    score -= CONFIDENCE_IMPL_MISSING_CODE_BLOCK_PENALTY;
    reasons.push(confidenceReasonMsg('implMissingCodeBlock'));
  }

  if (signals.priorFailurePattern?.trim()) {
    score -= PRIOR_FAILURE_PENALTY;
    reasons.push(confidenceReasonMsg('priorFailure', signals.priorFailurePattern.trim()));
  }

  score = Math.max(0, Math.min(1, Math.round(score * 1000) / 1000));
  const level = scoreToConfidenceLevel(score);

  if (reasons.length === 0) {
    reasons.push(confidenceReasonMsg('signalsGood'));
  }

  return { score, level, reasons };
}
