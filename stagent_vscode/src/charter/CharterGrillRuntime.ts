import type { Question } from '../WorkflowDefinition';
import { getStagentConfiguration } from '../settings/getStagentConfiguration';
import {
  readCharterAutoAnswerMode,
  readCharterEnabled,
  readCharterRelativePath,
} from '../settings/readers/charter';
import type { DecisionProvenance } from './CharterTypes';
import { loadCharterFromWorkspaceSync } from './CharterLoader';
import {
  recordCharterQuestionProvenance,
  syncDecisionProvenanceFromGrill,
  tryCharterAnswerForQuestionWithDoc,
  type CharterGrillAnswerAttempt,
} from './CharterGrillAutoAnswer';

export function tryCharterAnswerForQuestion(
  question: Pick<Question, 'id' | 'text' | 'hint'>,
  workspaceRoot: string | undefined,
  confidence = 0.85,
  confidenceThreshold = 0.4,
): CharterGrillAnswerAttempt | null {
  const cfg = getStagentConfiguration();
  if (!readCharterEnabled(cfg) || !workspaceRoot) {
    return null;
  }
  const mode = readCharterAutoAnswerMode(cfg);
  const doc = loadCharterFromWorkspaceSync(workspaceRoot, readCharterRelativePath(cfg));
  return tryCharterAnswerForQuestionWithDoc(question, doc, mode, confidence, confidenceThreshold);
}

/** 批量模式：尽可能用 Charter 预填未答问题。 */
export function prefillQuestionBeforeFromCharter(input: {
  questions: Question[] | undefined;
  answers: Record<string, string> | undefined;
  runtime: {
    questionBeforeAnswers?: Record<string, string>;
    charterQuestionProvenance?: Record<string, DecisionProvenance>;
  };
  workspaceRoot: string | undefined;
}): boolean {
  const list = input.questions ?? [];
  let changed = false;
  const merged = { ...(input.answers ?? {}), ...(input.runtime.questionBeforeAnswers ?? {}) };
  for (const q of list) {
    if (String(merged[q.id] ?? '').trim()) {
      continue;
    }
    const attempt = tryCharterAnswerForQuestion(q, input.workspaceRoot);
    if (!attempt?.filled || !attempt.answer) {
      continue;
    }
    input.runtime.questionBeforeAnswers = {
      ...(input.runtime.questionBeforeAnswers ?? {}),
      [q.id]: attempt.answer,
    };
    recordCharterQuestionProvenance(input.runtime, q.id, attempt.match.provenance);
    changed = true;
  }
  if (changed) {
    syncDecisionProvenanceFromGrill(input.runtime);
  }
  return changed;
}
