import * as vscode from 'vscode';
import { appendDebugLogLine, formatDebugLogLine, sanitizeForLog } from './WorkflowLogging';
import { appendSessionLogLineAsync, formatSessionLogLine } from './SessionDebugLog';
import { WORKFLOW_LEVEL_STAGE_ID } from './workflow/WorkflowLevelIds';
import { DEBUG_EVENT_DEGRADED, DEBUG_EVENT_USER_ACTION } from './DebugLogEvents';
import {
  SESSION_LOG_EVENT_DEGRADED,
  SESSION_LOG_EVENT_ERROR,
  SESSION_LOG_EVENT_METRICS_SUMMARY,
  SESSION_LOG_EVENT_WARN,
  SESSION_LOG_PURPOSE_DIAGNOSTICS,
  SESSION_LOG_PURPOSE_METRICS,
} from './SessionLogEvents';
import { MetricsCollector, type MetricsSnapshot } from './MetricsCollector';

export interface WorkflowEngineDiagnosticsDeps {
  getActiveInstanceKey: () => string | undefined;
  getTraceId: () => string | undefined;
  ensureTaskDir: (key: string) => string;
  getOrCreateOutputChannel: () => vscode.OutputChannel;
  getGlobalStoragePath: () => string;
}

/** 引擎横切日志：OutputChannel、.wf-debug.log、session log。 */
export class WorkflowEngineDiagnostics {
  private readonly metrics = new MetricsCollector();

  constructor(private readonly deps: WorkflowEngineDiagnosticsDeps) {}

  warn(message: string): void {
    console.warn(`[Stagent] ${message}`);
    this.deps.getOrCreateOutputChannel().appendLine(`[warn] ${message}`);
    this.persistDiagnostic(SESSION_LOG_EVENT_WARN, message);
  }

  /**
   * 引擎降级：best-effort 继续但能力受损（非用户可见错误）。
   * 统一落盘 session log + per-task debug log，替代散落的 console.warn。
   */
  degraded(reason: string, context?: Record<string, unknown>): void {
    const traceId = this.deps.getTraceId() ?? 'trace-missing';
    const payload = { reason, traceId, ...context };
    console.warn(`[Stagent] degraded: ${reason}`);
    this.deps.getOrCreateOutputChannel().appendLine(`[degraded] ${reason}`);
    this.persistDiagnostic(SESSION_LOG_EVENT_DEGRADED, reason, payload);
    this.debugLog(WORKFLOW_LEVEL_STAGE_ID, DEBUG_EVENT_DEGRADED, 0, payload);
  }

  /**
   * 引擎级错误：console.error + OutputChannel + 持久化到 session log。
   * 与 {@link warn} 一样落盘，使告警/错误进入事后可排障的持久轨迹。
   */
  error(message: string): void {
    console.error(`[Stagent] ${message}`);
    this.deps.getOrCreateOutputChannel().appendLine(`[error] ${message}`);
    this.persistDiagnostic(SESSION_LOG_EVENT_ERROR, message);
  }

  /**
   * 将 warn/error/degraded 落盘到 session log。
   * 注意：这里必须**完全吞掉**写入异常——本方法身处日志路径，若再经 {@link warn}
   * 上报失败会造成 warn→persist→warn 的无限递归。「记录日志失败」是唯一合理的静默 catch。
   */
  private persistDiagnostic(event: string, message: string, extra?: Record<string, unknown>): void {
    try {
      const dir = this.deps.getGlobalStoragePath();
      const traceId = this.deps.getTraceId();
      const payload = extra ? { message, traceId, ...extra } : { message, traceId };
      void appendSessionLogLineAsync(
        dir,
        formatSessionLogLine(SESSION_LOG_PURPOSE_DIAGNOSTICS, event, payload, traceId),
      ).catch(() => {
        /* 日志落盘失败不可再经 warn 上报（会递归） */
      });
    } catch {
      /* getGlobalStoragePath 等同步失败同样静默 */
    }
  }

  debugLog(stageId: string, event: string, attempt: number, payload?: unknown): void {
    const traceId = this.deps.getTraceId() ?? 'trace-missing';
    const line = formatDebugLogLine(traceId, stageId, event, attempt, sanitizeForLog(payload));
    this.appendDebugLine(line, { stageId, event, attempt, traceId, payload });
  }

  logUserAction(kind: string, detail: Record<string, unknown>): void {
    this.metrics.recordUserAction(kind, detail);
    const stageId = typeof detail.stageId === 'string' ? detail.stageId : WORKFLOW_LEVEL_STAGE_ID;
    this.debugLog(stageId, DEBUG_EVENT_USER_ACTION, 0, { kind, ...detail });
  }

  /** 测试 / 调用方读出当前聚合计数快照（不重置）。 */
  getMetricsSnapshot(): MetricsSnapshot {
    return this.metrics.snapshot();
  }

  /**
   * 任务结束（workflowCompleted / failed）时把聚合指标写入 session log（purpose=metrics），
   * 随后重置计数，使下一个任务从零开始。无活动时不写出，避免空快照噪声。
   */
  flushMetrics(reason: string): void {
    if (!this.metrics.hasActivity()) {
      return;
    }
    const traceId = this.deps.getTraceId();
    this.sessionLog(SESSION_LOG_PURPOSE_METRICS, SESSION_LOG_EVENT_METRICS_SUMMARY, {
      reason,
      traceId,
      ...this.metrics.snapshot(),
    });
    this.metrics.reset();
  }

  sessionLog(purpose: string, event: string, payload?: unknown): void {
    const dir = this.deps.getGlobalStoragePath();
    const traceId = this.deps.getTraceId();
    void appendSessionLogLineAsync(dir, formatSessionLogLine(purpose, event, payload, traceId)).catch((e) => {
      this.warn(`session-log-failed ${e instanceof Error ? e.message : String(e)}`);
    });
  }

  private appendDebugLine(
    line: string,
    fallbackMeta?: { stageId: string; event: string; attempt: number; traceId: string; payload?: unknown },
  ): void {
    const key = this.deps.getActiveInstanceKey();
    if (!key) {
      if (fallbackMeta) {
        void appendSessionLogLineAsync(
          this.deps.getGlobalStoragePath(),
          formatSessionLogLine('debug-fallback', fallbackMeta.event, {
            stageId: fallbackMeta.stageId,
            attempt: fallbackMeta.attempt,
            traceId: fallbackMeta.traceId,
            payload: sanitizeForLog(fallbackMeta.payload),
          }),
        ).catch((e) => {
          this.warn(`debug-fallback-session-log-failed ${e instanceof Error ? e.message : String(e)}`);
        });
      }
      return;
    }
    try {
      const dir = this.deps.ensureTaskDir(key);
      appendDebugLogLine(dir, line);
    } catch (e) {
      this.warn(`debug_log_append_failed err=${String(e)}`);
    }
  }
}
