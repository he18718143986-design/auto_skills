/**
 * 执行视图 stageStatus 写入策略（SSOT）。
 * 防止迟到的 error 消息把已成功（done/skipped）的阶段降级为 ❌。
 */
import { STAGE_STATUS_VALUES, type StageStatus } from '../../workflow-types/RuntimeTypes';

/** Webview store 与后端 StageStatus 同值域。 */
export type ExecStageStatus = StageStatus;

const VALID_EXEC_STAGE_STATUSES = new Set<string>(STAGE_STATUS_VALUES);

/**
 * 非法 status：生产环境 console.warn 并回退 pending（与 UI ⏳ 默认一致）。
 * 单测断言 warn 被调用，不在 test 里 throw。
 */
export function coerceExecStageStatus(raw: string): ExecStageStatus {
  if (VALID_EXEC_STAGE_STATUSES.has(raw)) {
    return raw as ExecStageStatus;
  }
  console.warn(`[Stagent webview] invalid stageStatus: ${raw}`);
  return 'pending';
}

const TERMINAL_SUCCESS = new Set<ExecStageStatus>(['done', 'skipped']);

/** 是否应拒绝将 prev 覆盖为 next（返回 true = 保持 prev）。 */
export function shouldRejectStageStatusDowngrade(
  prev: string | undefined,
  next: ExecStageStatus,
): boolean {
  if (!prev) {
    return false;
  }
  const p = coerceExecStageStatus(prev);
  if (TERMINAL_SUCCESS.has(p) && next === 'error') {
    return true;
  }
  return false;
}

/** 应用状态更新；若拒绝降级则返回 prev。 */
export function applyStageStatusUpdate(
  prev: string | undefined,
  next: ExecStageStatus,
): ExecStageStatus {
  if (shouldRejectStageStatusDowngrade(prev, next)) {
    return coerceExecStageStatus(prev!);
  }
  return next;
}
