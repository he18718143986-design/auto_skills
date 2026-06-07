import type { ErrorType } from './WorkflowDefinition';
import {
  ERROR_TYPE_CODE_RUNNER_TIMEOUT,
  ERROR_TYPE_FILE_NOT_FOUND,
  ERROR_TYPE_INVARIANT_VIOLATION,
  ERROR_TYPE_LLM_CONTEXT_OVERFLOW,
  ERROR_TYPE_LLM_INVALID_OUTPUT,
  ERROR_TYPE_LLM_TIMEOUT,
  ERROR_TYPE_STAGE_NOT_FOUND,
  ERROR_TYPE_TOOL_EXECUTION_FAILED,
  ERROR_TYPE_UNKNOWN,
  KNOWN_ERROR_TYPES,
} from './errors/stageErrorBuilders';

const KNOWN_ERROR_TYPE_SET = new Set<string>(KNOWN_ERROR_TYPES);

/** 旧 JSON / 外部消息缺少新 ErrorType 时回落 `unknown`。 */
export function normalizeErrorType(raw: unknown): ErrorType {
  if (typeof raw === 'string' && KNOWN_ERROR_TYPE_SET.has(raw)) {
    return raw as ErrorType;
  }
  return ERROR_TYPE_UNKNOWN;
}

/**
 * #11：携带显式 `errorType` 的错误子类，解除「错误分类」对「错误消息措辞」的耦合。
 *
 * 抛出方用本类标注语义类型（而非把类型编码进字符串前缀）；分类方用 `classifyThrownError`
 * 优先读 `instanceof StagentError`。`message` 仍保持原有格式（如 `file-not-found:<path>`），
 * 因此既有按字符串解析/展示的代码与测试不受影响。
 */
export class StagentError extends Error {
  readonly errorType: ErrorType;

  constructor(errorType: ErrorType, message: string) {
    super(message);
    this.name = 'StagentError';
    this.errorType = errorType;
    // 跨编译目标（ES5 downlevel）保持 instanceof 可靠
    Object.setPrototypeOf(this, StagentError.prototype);
  }
}

/** 不变式违反：message 保留 `invariant-violation:<detail>` 既有格式。 */
export function invariantViolation(detail: string): StagentError {
  return new StagentError(
    ERROR_TYPE_INVARIANT_VIOLATION,
    `${ERROR_TYPE_INVARIANT_VIOLATION}:${detail}`,
  );
}

/** 文件缺失：message 保留 `file-not-found:<path>` 既有格式。 */
export function fileNotFound(filePath: string): StagentError {
  return new StagentError(
    ERROR_TYPE_FILE_NOT_FOUND,
    `${ERROR_TYPE_FILE_NOT_FOUND}:${filePath}`,
  );
}

/** 阶段缺失：message 保留 `stage-not-found:<id>` 既有格式。 */
export function stageNotFound(stageId: string | undefined): StagentError {
  return new StagentError(
    ERROR_TYPE_STAGE_NOT_FOUND,
    `${ERROR_TYPE_STAGE_NOT_FOUND}:${stageId ?? ''}`,
  );
}

/** code-runner 超时：message 保留哨兵值 `code-runner-timeout`。 */
export function codeRunnerTimeout(): StagentError {
  return new StagentError(ERROR_TYPE_CODE_RUNNER_TIMEOUT, ERROR_TYPE_CODE_RUNNER_TIMEOUT);
}

/** 工具执行失败：message 保留 `tool-execution-failed: <detail>` 既有格式。 */
export function toolExecutionFailed(detail: string): StagentError {
  return new StagentError(
    ERROR_TYPE_TOOL_EXECUTION_FAILED,
    `${ERROR_TYPE_TOOL_EXECUTION_FAILED}: ${detail}`,
  );
}

/** 实现阶段空洞输出（自动重试后仍失败）。 */
export function implHollowOutput(detail = 'impl-hollow-output'): StagentError {
  return new StagentError(ERROR_TYPE_LLM_INVALID_OUTPUT, detail);
}

/** LLM 上下文超出限制。 */
export function llmContextOverflow(detail = 'llm-context-overflow'): StagentError {
  return new StagentError(ERROR_TYPE_LLM_CONTEXT_OVERFLOW, detail);
}

/** LLM 调用被取消。 */
export function llmCancelled(detail = 'llm-cancelled'): StagentError {
  return new StagentError(ERROR_TYPE_LLM_TIMEOUT, detail);
}

/**
 * 把抛出的异常分类为 `ErrorType`：引擎路径必须用 `StagentError.errorType`；
 * 非 StagentError 仅保留对外部/历史哨兵的最小回退（code-runner-timeout 字符串、cancelled 标志）。
 */
export function classifyThrownError(e: unknown, cancelled = false): ErrorType {
  if (e instanceof StagentError) {
    return e.errorType;
  }
  if (cancelled) {
    return ERROR_TYPE_LLM_TIMEOUT;
  }
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes(ERROR_TYPE_CODE_RUNNER_TIMEOUT)) {
    return ERROR_TYPE_CODE_RUNNER_TIMEOUT;
  }
  return ERROR_TYPE_TOOL_EXECUTION_FAILED;
}
