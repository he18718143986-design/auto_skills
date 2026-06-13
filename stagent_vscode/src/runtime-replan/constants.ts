/** 运行时插入的 replan stage id 前缀（与 confirm 期 stagent_ / M40 区分）。 */
export const RUNTIME_REPLAN_STAGE_ID_PREFIX = 'stage_runtime_replan_';

export const RUNTIME_REPLAN_MARKER = '[系统插入 · runtime-replan]';

/** 单 slice 默认最多插入 replan stage 次数（v1）。 */
export const DEFAULT_RUNTIME_REPLAN_MAX_PER_SLICE = 2;

/** 单 workflow 实例默认最多 replan 次数（v1）。 */
export const DEFAULT_RUNTIME_REPLAN_MAX_PER_INSTANCE = 6;

export const RUNTIME_REPLAN_OUTPUT_KEY = '_runtimeReplan';

/** test_run ↔ fix_if_failed 自修复链尝试计数（写在 test_run runtime.outputs）。 */
export const FIX_CHAIN_OUTPUT_KEY = '_fixChain';

/** 同 slice fix_if_failed 仍红时触发 fix-exhausted replan 的默认上限（v1）。 */
export const DEFAULT_FIX_EXHAUSTED_MAX_ATTEMPTS = 2;
