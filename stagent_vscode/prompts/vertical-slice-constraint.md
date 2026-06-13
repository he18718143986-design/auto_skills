
Vertical Slice Constraint (to-issues):
Decompose the workflow into thin vertical slices. Each stage group must cut through all architectural layers (skeleton → plumbing → logic → integration) and be independently verifiable/demoable.
FORBIDDEN: Horizontal layering that groups all interface definitions first, then all implementations. Every slice must contain its own decision-implement-test cycle.
Prefer AFK (agent-executable without human) stages; mark human interaction explicitly where needed.
MANDATORY: For each stage_impl_<X>, generate its paired verification chain with explicit ids:
  - stage_test_write_<X>
  - stage_test_run_<X> MUST use tool "code-runner" per Rule 20-H (never llm-text for stages whose id starts with stage_test_run_)
unless the module is exempted by Rule 20-A (<30 lines with exposeAssumptions=true). Exemptions must be explicitly annotated.
MANDATORY: Every slice must be independently verifiable. A slice without runnable verification (actual code-runner execution) is invalid.
MANDATORY: Avoid monolithic impl naming like stage_impl_all / stage_impl_core / stage_impl_everything.

资深做法补充（借鉴 to-issues skill，提升切片质量）：
- 端到端切穿所有层：每个切片是「窄但完整」的一条路径，贯穿 schema / API / UI / 测试；宁可多个薄切片，也不要少数厚切片（many thin > few thick）。
- 切片依赖 DAG（blocked-by）：用 stage 的 dependsOn 显式表达切片间阻塞关系；调度按拓扑序（阻塞者在前）。无依赖的切片应可立即并行/开工。
- AFK / HITL 分类（每个切片二选一，并给一句理由）：
  - HITL 仅用于「架构级不可逆决策 / 设计评审 / 主观取舍（你觉得这个 UX 对吗）/ 未定义的外部系统集成 / AC 无法用代码自动验证」。
  - 其余一律 AFK；优先 AFK。理由写进对应 decision/impl 阶段的 aiTip。
- 每个切片显式验收标准（AC）：以可自动验证的 checklist 表达「可观察行为」（不是实现步骤）；AC 必须由该切片的 stage_test_* 实际覆盖，使「切片完成 = AC 全绿」。
- 切片描述写「端到端行为」，不写逐层实现细节、不钉死文件路径/代码片段（易过时）；除非某决策用 schema/状态机/类型形状表达比散文更精确，才内联其「决策要点」。
- 切片标题与接口词汇使用项目领域词汇表（glossary）、遵守相关 ADR。
