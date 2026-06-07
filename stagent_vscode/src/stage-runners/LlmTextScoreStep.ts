import { isImplStageId } from '../workflow/StageIdPatterns';
import { runPostStageQualityGates } from '../QualityGateRunner';
import type { ToolPathBase } from '../WorkflowDefinition';
import {
  QUALITY_SCORE_OUTPUT_KEY,
  scoreStatically,
} from '../OutputQualityScorer';
import {
  buildConfidenceSignals,
  computeConfidence,
  CONFIDENCE_OUTPUT_KEY,
} from '../ConfidenceScorer';
import { DEFAULT_CONFIDENCE_PAUSE_THRESHOLD } from '../StagentSettingsDefaults';
import { applyModuleDepthPenaltyToQualityScore } from '../ModuleDepthScorer';
import { resolvePriorFailurePattern } from '../PriorFailurePatternResolver';
import {
  DEBUG_EVENT_CONFIDENCE_SCORED,
  DEBUG_EVENT_POST_IMPL_STATIC_ANALYSIS,
  DEBUG_EVENT_POST_IMPL_STATIC_ANALYSIS_ERROR,
  DEBUG_EVENT_POST_STAGE_QUALITY_GATE_ERROR,
  debugEventForQualityGate,
} from '../DebugLogEvents';
import type { PanelLike } from '../WorkflowExecutorTypes';
import type { StageStepContext } from './StageStepContext';

export async function scoreLlmTextConfidenceAndGates(
  ctx: StageStepContext,
  attempt: number,
  instanceKey: string,
  panel: PanelLike,
): Promise<void> {
  const { params, stage, runtime, instance } = ctx;
  const { postMessage, debugLog, primaryOutputKey: primaryKey, confidencePauseThreshold } = params;
  const { definition } = instance;
  const tc = stage.toolConfig as {
    type: 'llm-text';
    writeOutputToFile?: string;
    writePathBase?: ToolPathBase;
  };
  const outKey = primaryKey(stage);

  let quality = scoreStatically(stage, String(runtime.outputs[outKey] ?? ''), definition);
  if (
    params.architectureDepthScoringEnabled &&
    isImplStageId(stage.id) &&
    !stage.patchMode &&
    tc.writeOutputToFile &&
    /\.py$/i.test(tc.writeOutputToFile)
  ) {
    quality = applyModuleDepthPenaltyToQualityScore(quality, String(runtime.outputs[outKey] ?? ''));
  }
  runtime.outputs[QUALITY_SCORE_OUTPUT_KEY] = quality;

  const priorPattern = await resolvePriorFailurePattern({
    taskType: definition.meta.taskType,
    stageId: stage.id,
    workspaceRoot: params.getWorkspaceRoot?.(),
    enabled: params.memoryExperienceEnabled ?? false,
    warn: params.warnOnExperienceReadFailure,
  });
  const confidence = computeConfidence(
    buildConfidenceSignals(
      stage,
      runtime,
      outKey,
      String(runtime.outputs[outKey] ?? ''),
      quality,
      { priorFailurePattern: priorPattern },
    ),
  );
  runtime.outputs[CONFIDENCE_OUTPUT_KEY] = confidence;
  const pauseThreshold = confidencePauseThreshold ?? DEFAULT_CONFIDENCE_PAUSE_THRESHOLD;
  debugLog(stage.id, DEBUG_EVENT_CONFIDENCE_SCORED, attempt, {
    score: confidence.score,
    level: confidence.level,
    pauseThreshold,
    belowPauseThreshold: confidence.score < pauseThreshold,
    priorFailurePattern: priorPattern,
  });
  postMessage(panel, {
    type: 'stageConfidenceUpdate',
    stageId: stage.id,
    score: confidence.score,
    level: confidence.level,
    reasons: confidence.reasons,
  });

  if (isImplStageId(stage.id)) {
    await runPostImplQualityGates(ctx, attempt, instanceKey);
  }
}

async function runPostImplQualityGates(
  ctx: StageStepContext,
  attempt: number,
  instanceKey: string,
): Promise<void> {
  const { params, stage, runtime, instance } = ctx;
  const { debugLog } = params;
  const { definition } = instance;

  if (params.qualityGateExecutionHost) {
    try {
      const postSummary = await runPostStageQualityGates({
        phase: 'post-stage',
        workflow: definition,
        stage,
        stageIndex: ctx.stageIndex,
        stageRuntime: runtime,
        instance,
        instanceKey,
        executionHost: params.qualityGateExecutionHost,
      });
      for (const w of postSummary.warnings) {
        debugLog(stage.id, debugEventForQualityGate(w.gateId), attempt, { messages: w.messages });
      }
    } catch (e) {
      debugLog(stage.id, DEBUG_EVENT_POST_STAGE_QUALITY_GATE_ERROR, attempt, {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  } else if (params.postImplStaticAnalysis) {
    try {
      const analysisWarnings = await params.postImplStaticAnalysis(stage);
      if (analysisWarnings.length > 0) {
        debugLog(stage.id, DEBUG_EVENT_POST_IMPL_STATIC_ANALYSIS, attempt, { warnings: analysisWarnings });
      }
    } catch (e) {
      debugLog(stage.id, DEBUG_EVENT_POST_IMPL_STATIC_ANALYSIS_ERROR, attempt, {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
