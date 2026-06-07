/**
 * 5.3 可观测性指标汇总：从既有 `logUserAction` 调用点「聚合读出」运行期指标，
 * 不新增埋点。任务结束（workflowCompleted / failed）时由 WorkflowEngineDiagnostics
 * 把快照写入 session log（purpose=metrics）。
 *
 * 设计为纯内存累加器，无 I/O、无 vscode 依赖，可独立单测。
 */

export interface MetricsSnapshot {
  /** 运行关联 id（与 instance.traceId 一致）。 */
  traceId?: string;
  /** LLM 文本调用次数（按 llm_stream_summary 计）。 */
  llmCalls: number;
  /** 其中触发过重试的调用次数。 */
  llmRetries: number;
  /** 质量门 / 决策 / 审批通过次数（approve, approve_decision）。 */
  gatePass: number;
  /** 质量门 / 决策拒绝次数（approve_decision_rejected, retry_rejected）。 */
  gateReject: number;
  /** HITL 手动重试触发次数（retry）。 */
  hitlRetry: number;
  /** 问答澄清提交次数（answer_questions_before/after）。 */
  questionsAnswered: number;
  /** 阶段错误次数（stage_error）。 */
  stageErrors: number;
  /** 输入上下文降级次数（context_degrade：full→summary→reference）。 */
  contextDegrades: number;
}

const GATE_PASS_KINDS = new Set(['approve', 'approve_decision']);
const GATE_REJECT_KINDS = new Set(['approve_decision_rejected', 'retry_rejected']);
const QUESTION_KINDS = new Set(['answer_questions_before', 'answer_questions_after']);

function emptySnapshot(): MetricsSnapshot {
  return {
    llmCalls: 0,
    llmRetries: 0,
    gatePass: 0,
    gateReject: 0,
    hitlRetry: 0,
    questionsAnswered: 0,
    stageErrors: 0,
    contextDegrades: 0,
  };
}

export class MetricsCollector {
  private counters: MetricsSnapshot = emptySnapshot();

  /** 由 diagnostics.logUserAction 转调；按 kind 归类累加。未知 kind 忽略。 */
  recordUserAction(kind: string, detail?: Record<string, unknown>): void {
    if (kind === 'llm_stream_summary') {
      this.counters.llmCalls += 1;
      if (detail?.retried === true) {
        this.counters.llmRetries += 1;
      }
      return;
    }
    if (kind === 'retry') {
      this.counters.hitlRetry += 1;
      return;
    }
    if (kind === 'stage_error') {
      this.counters.stageErrors += 1;
      return;
    }
    if (kind === 'context_degrade') {
      this.counters.contextDegrades += 1;
      return;
    }
    if (GATE_PASS_KINDS.has(kind)) {
      this.counters.gatePass += 1;
      return;
    }
    if (GATE_REJECT_KINDS.has(kind)) {
      this.counters.gateReject += 1;
      return;
    }
    if (QUESTION_KINDS.has(kind)) {
      this.counters.questionsAnswered += 1;
    }
  }

  snapshot(): MetricsSnapshot {
    return { ...this.counters };
  }

  /** 任意计数 > 0 即视为有活动，避免任务结束写入全零噪声。 */
  hasActivity(): boolean {
    return Object.values(this.counters).some((v) => v > 0);
  }

  reset(): void {
    this.counters = emptySnapshot();
  }
}
