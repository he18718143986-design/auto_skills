/* ------------------------------------------------------------------ */
/*  SessionDebugLog.ts — 会话级调试日志                                 */
/*                                                                     */
/*  per-task 的 .wf-debug.log 只在工作流实例（taskDir）创建后才记录，    */
/*  覆盖不到「执行前」的 polishUserTask / generateClarifyQuestions /     */
/*  generateWorkflow 这几步的 LLM 调用与错误。本模块把这些会话级事件     */
/*  统一落到 globalStorageDir 下的单文件，便于「卡在生成前哪一步」排查。  */
/*                                                                     */
/*  纯函数 + fs，无 vscode/electron 依赖，便于 node:test 单测。          */
/* ------------------------------------------------------------------ */

import * as fs from 'fs';
import * as path from 'path';
import { appendLogLineAtomicSync } from './jsonl/JsonlAtomicAppend';
import { appendTextLine, ensureDir, rotateFileIfWouldExceed } from './FsAsync';
import { sanitizeForLog } from './WorkflowLogging';

import { SESSION_DEBUG_FILENAME } from './paths/StagentPaths';

export { SESSION_DEBUG_FILENAME } from './paths/StagentPaths';

/** #15：单文件大小上限（字节）。超过则轮换，保留一个 `.1` 备份，避免长期使用日志无限膨胀。 */
export const SESSION_DEBUG_MAX_BYTES = 5 * 1024 * 1024;

/** 该会话日志文件的完整路径。 */
export function sessionDebugLogPath(globalStorageDir: string): string {
  return path.join(globalStorageDir, SESSION_DEBUG_FILENAME);
}

/**
 * 格式化一行会话日志：`<ISO> [session] [purpose] [event] <json>`。
 * purpose 即 LLM 调用的 traceStageId（见 [`GenerationTraceStageIds.ts`](../src/generation/GenerationTraceStageIds.ts)：
 * task-polish / workflow-gen / clarify-questions / …）。payload 经 sanitizeForLog 脱敏 + 截断。
 */
export function formatSessionLogLine(
  purpose: string,
  event: string,
  payload?: unknown,
  traceId?: string,
): string {
  const safe = payload === undefined ? '' : JSON.stringify(sanitizeForLog(payload));
  const tracePart = traceId ? ` [trace:${traceId}]` : '';
  return `${new Date().toISOString()} [session]${tracePart} [${purpose}] [${event}] ${safe}`;
}

/**
 * 追加一行到会话日志（目录不存在则创建）。调用方应自行兜底异常。
 * #15：写入前若当前文件 + 本行将超过 `maxBytes`，先轮换（覆盖单个 `.1` 备份再新建），
 * 使磁盘占用上限约为 2×maxBytes。轮换为 best-effort，失败不影响本行写入。
 */
export function appendSessionLogLine(
  globalStorageDir: string,
  line: string,
  maxBytes: number = SESSION_DEBUG_MAX_BYTES,
): void {
  fs.mkdirSync(globalStorageDir, { recursive: true });
  const filePath = sessionDebugLogPath(globalStorageDir);
  appendLogLineAtomicSync(filePath, line, { maxBytes });
}

/** #7：异步追加一行（热路径 sessionLog 使用，fire-and-forget）。 */
export async function appendSessionLogLineAsync(
  globalStorageDir: string,
  line: string,
  maxBytes: number = SESSION_DEBUG_MAX_BYTES,
): Promise<void> {
  await ensureDir(globalStorageDir);
  const filePath = sessionDebugLogPath(globalStorageDir);
  const incoming = Buffer.byteLength(`${line}\n`, 'utf-8');
  await rotateFileIfWouldExceed(filePath, incoming, maxBytes);
  await appendTextLine(filePath, line);
}
