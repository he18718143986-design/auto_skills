import type * as vscode from 'vscode';
import { validateRequiredAnswers } from '../QuestionAfterFlow';
import { readGrillAdaptiveModeForStage } from '../GrillAdaptiveFlow';
import { getStagentConfiguration } from '../settings/getStagentConfiguration';
import { applyQuestionBeforeAnswers } from '../WorkflowStateTransitions';
import type { HitlCoordinatorHost } from './HitlCoordinatorHost';
import { advanceStageAfterHitl } from './advanceAfterHitl';
import { postMissingAnswersStageError } from './questionAnswerValidation';
import { withHitlStageBinding } from './withHitlStageBinding';

export async function handleAnswerQuestionsBefore(
  host: HitlCoordinatorHost,
  stageId: string,
  answers: Record<string, string>,
  panel: vscode.WebviewPanel,
): Promise<void> {
  await withHitlStageBinding(host, stageId, panel, async ({ instance, idx, stage, rt }) => {
    const adaptiveGrill = readGrillAdaptiveModeForStage({
      cfg: getStagentConfiguration(),
      isDecisionStage: !!stage.isDecisionStage,
      questionBefore: stage.questionBefore,
      workflow: instance.definition,
      stage,
    });
    const requiredCheck = adaptiveGrill
      ? validateRequiredAnswers(
          stage.questionBefore?.filter((q) => q.id in answers),
          answers,
        )
      : validateRequiredAnswers(stage.questionBefore, { ...rt.questionBeforeAnswers, ...answers });
    if (!requiredCheck.ok) {
      postMissingAnswersStageError(host, panel, stageId, requiredCheck.missingIds, 'answer_questions_before_rejected');
      return;
    }

    host.logUserAction('answer_questions_before', { stageId, answerKeys: Object.keys(answers) });
    applyQuestionBeforeAnswers(rt, answers);
    if (instance.currentStageIndex !== idx) {
      host.setCurrentStageIndex(idx);
    }
    host.scheduleSave();
    await advanceStageAfterHitl(host, panel);
  });
}
