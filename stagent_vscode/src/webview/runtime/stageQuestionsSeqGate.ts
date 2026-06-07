/** stageQuestions / stageQuestionsBefore 专用 seq：不 bump 全局 lastApplied，允许 payload 先于 status 到达。 */

const lastAfterQuestionsSeqByStage: Record<string, number> = {};
const lastBeforeQuestionsSeqByStage: Record<string, number> = {};

function clearRecord(rec: Record<string, number>): void {
  for (const k of Object.keys(rec)) {
    delete rec[k];
  }
}

export function resetStageQuestionsSeqState(): void {
  clearRecord(lastAfterQuestionsSeqByStage);
  clearRecord(lastBeforeQuestionsSeqByStage);
}

export function clearStageQuestionsSeqForStages(stageIds: string[]): void {
  for (const id of stageIds) {
    delete lastAfterQuestionsSeqByStage[id];
    delete lastBeforeQuestionsSeqByStage[id];
  }
}

/** 全局 stale 下限（只读）：seq ≤ lastApplied 时丢弃，但不推进 lastApplied。 */
export function isStaleBackendSeq(seq: number, lastApplied: number): boolean {
  return seq <= lastApplied;
}

/**
 * 是否应用 questions payload：
 * - 无 seq：放行（兼容旧 replay/单测）
 * - seq ≤ 全局 lastApplied：stale replay（如 instanceResumed 快照之后）
 * - seq ≤ 该 stage 上次 questions seq：重复/stale payload
 * 不 bump 全局 lastApplied，避免 questions 先于 status 时被误杀或挡住后续 status。
 */
export function shouldApplyStageQuestions(
  stageId: string,
  kind: 'after' | 'before',
  seq: number | undefined,
  lastAppliedGlobal: number,
): boolean {
  if (typeof seq !== 'number') {
    return true;
  }
  if (isStaleBackendSeq(seq, lastAppliedGlobal)) {
    return false;
  }
  const byStage = kind === 'after' ? lastAfterQuestionsSeqByStage : lastBeforeQuestionsSeqByStage;
  const prev = byStage[stageId];
  if (typeof prev === 'number' && seq <= prev) {
    return false;
  }
  return true;
}

export function recordStageQuestionsSeq(
  stageId: string,
  kind: 'after' | 'before',
  seq: number | undefined,
): void {
  if (typeof seq !== 'number') {
    return;
  }
  const byStage = kind === 'after' ? lastAfterQuestionsSeqByStage : lastBeforeQuestionsSeqByStage;
  byStage[stageId] = seq;
}

/** 单测：读取 stage 上已记录的 questions seq。 */
export function getRecordedStageQuestionsSeq(
  stageId: string,
  kind: 'after' | 'before',
): number | undefined {
  const byStage = kind === 'after' ? lastAfterQuestionsSeqByStage : lastBeforeQuestionsSeqByStage;
  return byStage[stageId];
}
