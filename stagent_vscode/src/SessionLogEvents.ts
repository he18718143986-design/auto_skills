/**
 * globalStorage session debug log 的 purpose / event 名（单点定义）。
 * 与 DebugLogEvents（per-task `.wf-debug.log`）分域。
 */

export const SESSION_LOG_PURPOSE_LLM_MODEL_SELECT = 'llm-model-select';

export const SESSION_LOG_EVENT_LLM_START = 'llm_start';
export const SESSION_LOG_EVENT_LLM_END = 'llm_end';
export const SESSION_LOG_EVENT_LLM_ERROR = 'llm_error';
export const SESSION_LOG_EVENT_INPUT_SUMMARY_ERROR = 'input_summary_error';

export const SESSION_LOG_EVENT_RESOLVED = 'resolved';
export const SESSION_LOG_EVENT_ALL_ATTEMPTS_FAILED = 'all_attempts_failed';

/** 引擎横切诊断（warn/error）落盘的 purpose（与 LLM/模型选择分域）。 */
export const SESSION_LOG_PURPOSE_DIAGNOSTICS = 'diagnostics';
export const SESSION_LOG_EVENT_WARN = 'warn';
export const SESSION_LOG_EVENT_ERROR = 'error';
/** 引擎降级路径（best-effort 继续但能力受损）；与 warn 分事件便于检索。 */
export const SESSION_LOG_EVENT_DEGRADED = 'degraded';

/** 运行期指标汇总落盘的 purpose（任务结束时一次性写出聚合计数）。 */
export const SESSION_LOG_PURPOSE_METRICS = 'metrics';
export const SESSION_LOG_EVENT_METRICS_SUMMARY = 'summary';
