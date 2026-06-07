import { resolveWebviewString } from './webview/l10n/resolveWebviewString';
import {
  validateRequiredAnswers as validateRequiredAnswersShared,
  type RequiredAnswerCheck,
} from './hitl/requiredAnswers';
import type { Question, Stage, StageRuntime } from './WorkflowDefinition';
import { guardedStageTransition } from './WorkflowStateTransitions';

export type { RequiredAnswerCheck };

export function buildAnswerQuestionsMessage(stageId: string, answers: Record<string, string>) {
  return { type: 'answerQuestions', stageId, answers } as const;
}

/** I-8 纯函数：校验「required=true 的 Question 是否有非空答案」。 */
export function validateRequiredAnswers(
  questions: Question[] | undefined,
  answers: Record<string, string> | undefined,
): RequiredAnswerCheck {
  return validateRequiredAnswersShared(questions, answers);
}

/** Webview：I-8 校验失败时的用户可见文案（与引擎拒绝原因一致，但更友好）。 */
export function formatRequiredAnswersValidationError(
  questions: Question[] | undefined,
  missingIds: string[],
): string {
  if (missingIds.length === 0) {
    return '';
  }
  const list = questions ?? [];
  const parts = missingIds.map((id) => {
    const q = list.find((x) => x.id === id);
    const label = String(q?.text ?? '').trim();
    return label ? `「${label}」` : id;
  });
  return resolveWebviewString('stagent.webview.plan.requiredAnswers', parts.join('、'));
}

/** 含 questionAfter 时禁止走普通 `approve`，须通过 Webview 提交 `answerQuestions`（SKILLS §2 / Milestone 3）。 */
export function blocksDirectApproveForQuestionAfter(stage: Pick<Stage, 'questionAfter'>): boolean {
  return (stage.questionAfter?.length ?? 0) > 0;
}

/**
 * I-20：普通 `approve` 是否允许作用于该阶段（M14.2 深度防御）。
 *
 * `isDecisionStage === true` 的阶段**必须**走 `approveDecision`（携带 decisionRecord 提交）；
 * 直接发 `approve` 会绕过决策清单写入与 §4.4 内容契约。引擎层应直接拒绝，不依赖 UI 防线（UI 已通过
 * `WebviewPauseUiState` 隐藏普通批准按钮，但消息可被伪造或来自旧版面板）。
 *
 * 与 `blocksDirectApproveForQuestionAfter` 是两条独立闸门：
 *   - 此函数：阻挡决策阶段的普通 approve（I-20）
 *   - 上者：阻挡含 questionAfter 阶段的普通 approve（避免跳过追问）
 */
export function isPlainApproveAllowedForStage(stage: Pick<Stage, 'isDecisionStage'>): boolean {
  return stage.isDecisionStage !== true;
}

export function shouldAutoAdvanceAfterAnswers(
  stage: Stage | undefined,
  runtime: StageRuntime | undefined,
  currentStageIndex: number,
  stageIndex: number,
): boolean {
  if (!stage || !runtime) {
    return false;
  }
  if (currentStageIndex !== stageIndex) {
    return false;
  }
  if (runtime.status !== 'paused') {
    return false;
  }
  return (stage.questionAfter?.length ?? 0) > 0;
}

export function applyQuestionAfterAnswers(
  runtime: StageRuntime,
  answers: Record<string, string>,
  nowIso: string,
): void {
  runtime.questionAnswers = { ...runtime.questionAnswers, ...answers };
  guardedStageTransition(runtime, 'done', 'question-after-answers');
  runtime.completedAt = nowIso;
}
