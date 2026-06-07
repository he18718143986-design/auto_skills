import { applyPreStageQualityGates } from '../../WorkflowStagePreGates';
import { handleQuestionBeforeGate } from '../../WorkflowStageQuestionGate';
import { emitStageError, invariantStageError } from '../../WorkflowStageErrorHelpers';
import { DECISION_STAGE_INVARIANT_I1_MSG } from '../../workflow/DecisionStageShape';
import { isDecisionLlmTextStage } from '../../workflow/StageToolKinds';
import type { StageStepOutcome } from '../../WorkflowExecutorTypes';
import type { StageStepContext } from '../StageStepContext';

/** skip / pre-gates / question-before / 决策阶段 invariant。返回 null 表示继续执行工具。 */
export async function runStagePrelude(ctx: StageStepContext): Promise<StageStepOutcome | null> {
  const { params, stage, runtime, instance, panel } = ctx;
  const { evaluateSkipCondition, postMessage, scheduleSave, logUserAction } = params;

  if (stage.skipIf && evaluateSkipCondition(stage.skipIf, instance.stageRuntimes)) {
    runtime.status = 'skipped';
    runtime.completedAt = new Date().toISOString();
    logUserAction?.('stage_skipped', {
      stageId: stage.id,
      condition: stage.skipIf,
    });
    postMessage(panel, { type: 'stageStatusUpdate', stageId: stage.id, status: 'skipped' });
    scheduleSave();
    return 'continue';
  }

  const gateAlways = await applyPreStageQualityGates(params, stage, ctx.stageIndex, 'always', 0);
  if (gateAlways === 'failed') {
    return 'failed';
  }

  const questionGate = await handleQuestionBeforeGate(
    params,
    stage,
    runtime,
    panel,
    postMessage,
    scheduleSave,
  );
  if (questionGate !== null) {
    return questionGate;
  }

  if (stage.isDecisionStage && !isDecisionLlmTextStage(stage)) {
    runtime.status = 'error';
    emitStageError(panel, postMessage, instance, invariantStageError(stage.id, DECISION_STAGE_INVARIANT_I1_MSG));
    instance.status = 'failed';
    return 'failed';
  }

  return null;
}
