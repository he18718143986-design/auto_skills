
Debug Workflow Constraint (taskType='debug'):
目标：围绕“可复现 -> 可解释 -> 可验证修复”构建最小调试闭环。
MANDATORY:
1) 建议包含阶段：stage_decide_debug_scope -> stage_reproduce_debug_case -> stage_hypothesis_debug_root_cause -> stage_impl_debug_fix -> stage_test_run_debug_regression。
2) 必须至少有一个可执行复现或验证动作（优先 code-runner）。
3) stage_impl_debug_fix 的输入应包含 decisionRecord 或 hypothesis 类输出（避免盲修）。
4) 输出应体现：复现条件、根因假设、修复后验证结果。
5) 反馈回路优先（I-26）：可执行复现/回归（code-runner / reproduce）阶段必须排在「根因假设」与「修复实现」之前——先建立能稳定复现的失败信号，再假设、再修。
FORBIDDEN:
- 只有“修复实现”而无复现/验证阶段。
- 无法说明成功判据（例如“看起来修好了”）。
- 把假设/修复阶段排在任何可执行复现之前（违反反馈回路优先）。

工程与测试（分层借鉴）：tsconfig 建议 esModuleInterop；纯逻辑与 vscode 分离以便 node 侧验证；tsc 显式 -p。质量门禁仍以 debug 决策/复现链与 Stagent CodeRunnerCommandLint 为准。
