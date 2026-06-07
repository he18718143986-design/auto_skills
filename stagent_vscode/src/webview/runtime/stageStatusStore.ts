import {
  applyStageStatusUpdate,
  coerceExecStageStatus,
  type ExecStageStatus,
} from '../shared/stageStatusPolicy';
import { clearStageQuestionsSeqForStages, resetStageQuestionsSeqState } from './stageQuestionsSeqGate';
import { execStore } from './stores';

const maps = execStore.stageMaps;

/** 已应用的最大 backend seq（全局单调；无 seq 的旧消息仍按 policy 应用）。 */
let lastAppliedStageStatusSeq = 0;

export function getStageStatus(stageId: string): ExecStageStatus | undefined {
  return maps.stageStatus[stageId];
}

export function resetStageStatusSeqState(): void {
  lastAppliedStageStatusSeq = 0;
  resetStageQuestionsSeqState();
}

/** 全局 stale 判定（只读，不 bump）。 */
export function getLastAppliedBackendSeq(): number {
  return lastAppliedStageStatusSeq;
}

export function isStaleBackendSeq(seq?: number): boolean {
  if (typeof seq !== 'number') {
    return false;
  }
  return seq <= lastAppliedStageStatusSeq;
}

/** 单条增量消息 seq 门禁；无 seq 时放行（兼容旧消息/单测）。 */
export function tryAdvanceBackendSeq(seq?: number): boolean {
  if (typeof seq !== 'number') {
    return true;
  }
  if (seq <= lastAppliedStageStatusSeq) {
    return false;
  }
  lastAppliedStageStatusSeq = seq;
  return true;
}

/** instanceResumed 全量快照：逐 stage 写 policy，最后一次性 bump seq。 */
export function applyStageStatusSnapshot(
  statuses: Record<string, ExecStageStatus | string | undefined>,
  snapshotSeq?: number,
): void {
  for (const [sid, st] of Object.entries(statuses)) {
    if (!st) {
      continue;
    }
    const next = coerceExecStageStatus(String(st));
    const prev = maps.stageStatus[sid];
    maps.stageStatus[sid] = applyStageStatusUpdate(prev, next);
  }
  if (typeof snapshotSeq === 'number' && snapshotSeq > lastAppliedStageStatusSeq) {
    lastAppliedStageStatusSeq = snapshotSeq;
  }
}

/** 唯一写入入口：所有 handler 应经此函数更新 stageStatus。 */
export function patchStageStatus(
  stageId: string,
  next: ExecStageStatus,
  seq?: number,
): {
  applied: boolean;
  prev: ExecStageStatus | undefined;
  status: ExecStageStatus;
} {
  const coerced = coerceExecStageStatus(next);
  if (!tryAdvanceBackendSeq(seq)) {
    const prev = maps.stageStatus[stageId];
    return { applied: false, prev, status: prev ?? coerced };
  }
  const prev = maps.stageStatus[stageId];
  const status = applyStageStatusUpdate(prev, coerced);
  const applied = status !== prev;
  maps.stageStatus[stageId] = status;
  return { applied, prev, status };
}

function applyStagesToPending(stageIds: string[]): void {
  clearStageQuestionsSeqForStages(stageIds);
  for (const id of stageIds) {
    const prev = maps.stageStatus[id];
    maps.stageStatus[id] = applyStageStatusUpdate(prev, 'pending');
    delete maps.stageOutputs[id];
    delete maps.stageConfidence[id];
    delete maps.stageArtifacts[id];
    delete maps.afterQuestionsByStage[id];
    delete maps.beforeQuestionsByStage[id];
  }
}

/** downstreamReset 批量 pending：先过 seq 门禁，再逐 stage 写 policy（不 per-entry bump）。 */
export function resetStagesToPending(stageIds: string[], batchSeq?: number): boolean {
  if (typeof batchSeq === 'number' && !tryAdvanceBackendSeq(batchSeq)) {
    return false;
  }
  applyStagesToPending(stageIds);
  return true;
}
