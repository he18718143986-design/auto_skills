
Refactor Workflow Constraint (taskType='refactor'):
目标：在不改变外部可观察行为的前提下，优化模块边界、依赖方向和可测试性。
MANDATORY:
1) 必须包含至少 1 个架构决策阶段：stage_decide_refactor_<X>（isDecisionStage=true, pauseAfter=true, outputs 包含 decisionRecord）。
2) 每个实现阶段必须成对出现验证链：stage_test_write_<X> -> stage_impl_<X> -> stage_test_run_<X>（或等价 code-runner 验证）。
2b) 若验证链使用 jest / npm test / npx jest：首个此类 stage_test_run_* 之前须有 stage_impl_* 落盘 jest.config.*（Expo/RN 还须 babel.config.*），见 TEST INFRASTRUCTURE BEFORE test_run（M39.1）。
3) stage_impl_<X> 的 input.sources 必须包含 decisionRecord 依赖，并在 systemPrompt 中包含：
   "严格按照已确认的决策清单实现，不得偏离。如发现清单中存在矛盾，在代码注释中标注。"
4) 优先 AFK；若出现多个 HITL 暂停点，必须在描述中说明必要性。
FORBIDDEN:
- 只输出“重命名/格式化”而无验证阶段的工作流。
- monolithic 命名（例如 stage_impl_all / stage_impl_everything）。

工程与测试（分层借鉴，与 software 同源）：子项目 tsconfig 建议 strict + esModuleInterop；可被 node/ts-node 直接跑的测试只 import 无顶层 vscode 的纯模块；tsc 一律 npx tsc -p tsconfig.json。仍须遵守 Stagent 的 Rule 20、决策记录与 CodeRunnerCommandLint，不用命令二进制白名单替代。
