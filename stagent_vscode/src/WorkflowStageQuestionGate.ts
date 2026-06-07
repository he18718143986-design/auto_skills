import {
  resolveAdaptiveGrillState,
  shouldEnterAdaptiveWaitingQuestions,
  shouldEnterBatchWaitingQuestions,
  shouldUseAdaptiveGrill,
} from './GrillAdaptiveFlow';
import type { Stage, StageRuntime } from './WorkflowDefinition';
import type { ExecuteNextStageLoopParams, PanelLike, StageStepOutcome } from './WorkflowExecutorTypes';
import { guardedStageTransition } from './WorkflowStateTransitions';

/** M23：questionBefore 批量或自适应单题 + code-explore 自答循环 */
export async function handleQuestionBeforeGate(
  params: ExecuteNextStageLoopParams,
  stage: Stage,
  runtime: StageRuntime,
  panel: PanelLike,
  postMessage: ExecuteNextStageLoopParams['postMessage'],
  scheduleSave: () => void,
): Promise<StageStepOutcome | null> {
  const questions = stage.questionBefore;
  if (!questions?.length) {
    return null;
  }

  if (shouldUseAdaptiveGrill(params.isAdaptiveGrillForStage?.(stage) === true, questions)) {
    let round = runtime.grillRound ?? 0;
    for (let guard = 0; guard < 12; guard += 1) {
      const state = resolveAdaptiveGrillState({
        questions,
        answers: runtime.questionBeforeAnswers,
        round,
      });
      if (state.done) {
        runtime.grillRound = round;
        return null;
      }
      if (state.action.kind === 'explore-code' && params.tryGrillCodeExplore) {
        const auto = await params.tryGrillCodeExplore(state.action.question);
        round += 1;
        runtime.grillRound = round;
        if (auto?.trim()) {
          runtime.questionBeforeAnswers = {
            ...(runtime.questionBeforeAnswers ?? {}),
            [state.action.question.id]: auto.trim(),
          };
          continue;
        }
      }
      if (shouldEnterAdaptiveWaitingQuestions(state) && state.questionToAsk) {
        guardedStageTransition(runtime, 'waiting-questions', 'question-before-adaptive');
        runtime.grillRound = round;
        postMessage(panel, {
          type: 'stageStatusUpdate',
          stageId: stage.id,
          status: 'waiting-questions',
          isDecisionStage: stage.isDecisionStage,
        });
        postMessage(panel, {
          type: 'stageQuestionsBefore',
          stageId: stage.id,
          questions: [state.questionToAsk],
        });
        scheduleSave();
        return 'halt';
      }
      round += 1;
      runtime.grillRound = round;
    }
    return null;
  }

  if (shouldEnterBatchWaitingQuestions(questions, runtime.questionBeforeAnswers)) {
    guardedStageTransition(runtime, 'waiting-questions', 'question-before-batch');
    postMessage(panel, {
      type: 'stageStatusUpdate',
      stageId: stage.id,
      status: 'waiting-questions',
      isDecisionStage: stage.isDecisionStage,
    });
    postMessage(panel, {
      type: 'stageQuestionsBefore',
      stageId: stage.id,
      questions: stage.questionBefore ?? [],
    });
    scheduleSave();
    return 'halt';
  }
  return null;
}
