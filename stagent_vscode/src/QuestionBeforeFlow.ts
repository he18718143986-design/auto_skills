import type { Question } from './WorkflowDefinition';
import {
  getMissingRequiredQuestionIds as getMissingRequiredQuestionIdsShared,
  validateRequiredAnswers as validateRequiredAnswersShared,
  type RequiredAnswerCheck,
} from './hitl/requiredAnswers';

export type { RequiredAnswerCheck };

export function getMissingRequiredQuestionIds(
  questions: Question[] | undefined,
  answers: Record<string, string> | undefined,
): string[] {
  return getMissingRequiredQuestionIdsShared(questions, answers);
}

export function shouldEnterWaitingQuestions(
  questions: Question[] | undefined,
  answers: Record<string, string> | undefined,
): boolean {
  return getMissingRequiredQuestionIds(questions, answers).length > 0;
}

export function buildAnswerQuestionsBeforeMessage(stageId: string, answers: Record<string, string>) {
  return { type: 'answerQuestionsBefore', stageId, answers } as const;
}
