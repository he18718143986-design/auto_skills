
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

资深做法补充（借鉴 diagnose skill 六阶段，提升 debug 质量）：
- Phase 1「建反馈环」是整个 skill 的核心：把不成比例的精力花在「快速、确定性、可由 agent 跑的 pass/fail 信号」上；有了它，二分/验证假设/插桩都只是消费这个信号。复现阶段须优先构造其一（大致按此顺序）：失败测试 → curl/HTTP 脚本打 dev server → CLI + fixture 比对快照 → headless 浏览器脚本 → 回放抓取的 trace/payload → 一次性 harness（最小子系统单函数触发）→ property/fuzz（千次随机输入）→ bisection harness（git bisect run）→ differential（新旧版本同输入比对）→ HITL 脚本（最后手段）。
- 把反馈环当产品迭代：更快（缓存/跳过无关 init/缩范围）、信号更锐（断言具体症状而非「没崩」）、更确定（钉时间/seed RNG/隔离 FS/冻结网络）。2 秒确定性环 >> 30 秒 flaky 环。
- 非确定性 bug：目标不是干净复现而是「提高复现率」——循环触发 100×、并行、加压、收窄时序窗、注入 sleep；50% flake 可调，1% 不可，先把率拉到可调。
- Phase 3 假设：先生成 3–5 个**排序且可证伪**的假设再测（格式：「若 X 是因，则改 Y 会让 bug 消失 / 改 Z 会更糟」）；说不出预测的假设是 vibe，丢弃或锐化；AFK 时按自己排序推进。
- Phase 4 插桩：每个探针对应 Phase 3 的某个预测，**一次只改一个变量**；优先 debugger/REPL（一个断点胜十条日志），其次边界处定向日志，禁止「全量打日志再 grep」；每条调试日志加唯一前缀 `[DEBUG-xxxx]` 便于末尾一次性清除；性能回归走「先测基线再二分」而非打日志。
- Phase 5 回归测试须落在**正确 seam**（能在真实调用点复现真实 bug 模式）；若无正确 seam，「这件事本身就是发现」——记录之，并交给 improve-architecture（架构在阻止 bug 被锁定）。先写失败测试→看失败→修→看通过→再跑 Phase 1 原始场景。
- Phase 6 收尾/复盘（声明完成前）：原始复现不再复现；回归测试通过（或记录无 seam）；所有 `[DEBUG-]` 插桩已移除；一次性 prototype 已删；把「最终被证实的假设」写进 commit/PR 供后人学习；最后问「什么能预防此 bug」，若涉及架构改动则在修复后交给 improve-architecture。

工程与测试（分层借鉴）：tsconfig 建议 esModuleInterop；纯逻辑与 vscode 分离以便 node 侧验证；tsc 显式 -p。质量门禁仍以 debug 决策/复现链与 Stagent CodeRunnerCommandLint 为准。
