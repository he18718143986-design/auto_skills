
Improve-Architecture Workflow Constraint (taskType='improve-architecture'):
目标：识别 ball-of-mud / 浅模块，产出只读「加深候选」与 seam 分析，不直接大改代码。
MANDATORY:
1) 建议链路：stage_zoom_out（模块地图）-> stage_decide_architecture_deepening（DecisionRecord）-> 可选 stage_impl_<seam>_extract（小步 seam 提取，每切片一循环）。
2) DecisionRecord 须含：deletion-test 候选列表、模块边界表、拟提取 seam、风险与回滚策略。
3) 每个 impl 切片须有配对 test_run 或行为等价验证（与 refactor 相同 external-behavior 纪律）。
4) 优先消费 .stagent/CONTEXT.md 词汇表与已有 ADR，避免重复 litigate 已决架构。
FORBIDDEN:
- 无 zoom_out / 模块地图直接进入大面积重写。
- 无验证阶段的「架构改进」impl。
