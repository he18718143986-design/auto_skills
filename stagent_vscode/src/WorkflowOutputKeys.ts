/** 写入 StageRuntime.outputs 的保留键名（与 ConfidenceScorer / ExperienceStore 共享）。 */
export const CONFIDENCE_OUTPUT_KEY = '_confidence';

/** 实现阶段主输出键（与 workflow JSON schema / Rule20 约定一致）。 */
export const PRIMARY_IMPL_OUTPUT_KEY = 'implCode';

/** 决策阶段主输出键。 */
export const PRIMARY_DECISION_OUTPUT_KEY = 'decisionRecord';

/** zoom-out 阶段 module-map 输出键。 */
export const ZOOM_OUT_MODULE_MAP_KEY = 'moduleMap';

/** code-runner 退出码写入 runtime.outputs 的键。 */
export const CODE_RUNNER_EXIT_OUTPUT_KEY = '_exitCode';

/** 引擎 disk-bootstrap：npm init 日志输出键。 */
export const NPM_INIT_LOG_OUTPUT_KEY = 'npmInitLog';

/** structural-repair 默认 verify 输出键。 */
export const VERIFY_OUT_OUTPUT_KEY = 'verifyOut';

/** StaticAnalysisPipeline tsc 输出键。 */
export const TSC_OUTPUT_OUTPUT_KEY = 'tscOutput';
