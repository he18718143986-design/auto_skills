# ADR-0001：Agent 职责架构评审纪要

- **状态**：Accepted（评审结论已吸收进 STAGENT-PRD v1.5）
- **日期**：2026-06-10
- **决策者**：产品 / 引擎联合评审
- **关联**：[STAGENT-PRD.md §11](../STAGENT-PRD.md)、[stagent_agent_work_flow.svg](../stagent_agent_work_flow.svg)

## 背景

对 Stagent Agent 职责流程图（引擎 vs LLM 分工）做系统性评审，验证 AFK 自动化架构是否可落地，并识别实现前须关闭的工程瓶颈。

## 结论

**方案可行，引擎/Agent 分工正确。** 主瓶颈在 Phase A（工作计划生成）的结构可靠性，以及若干执行期边界；属实现与优先级问题，非架构推翻项。

## 设计亮点（已对齐实现）

| 维度 | 结论 |
|------|------|
| 职责分离 | DAG 编排、Gate、pytest 锁在引擎；Agent 只做 `llm-text` 与计划 JSON 生成 |
| TDD 硬门禁 | `RedGreenGate` 依 pytest 退出码阻断 delivery，不依赖 LLM 主观判断 |
| 决策传播 | `GlobalDecisionContext` 将已批准 `DecisionRecord` 注入后续 stage，防架构漂移 |
| fix 链终止 | `DEFAULT_FIX_EXHAUSTED_MAX_ATTEMPTS = 2`；耗尽 → `runtime-replan` → `MustEscalateToHuman` |

## 风险项（处置状态以 PRD §15 为准）

评审识别的五条风险（ExecutionPlan 可靠性、fix 上限、autoApprove 语义盲区、Token 累积、Charter 偏差）已合并进 [STAGENT-PRD.md §15](../STAGENT-PRD.md#15-风险与缓解)，含 **处置状态** 列（已实现 / 部分实现 / 未实现）。

## 后续决策（已写入 PRD）

1. **骨架模板**：从 M5 末位提升为 **M3 并行 Phase0**；`plan-skeleton/expandGreenfieldPythonSkeleton` + `compileGreenfieldPythonSkeletonPlan` T4 mock lint 绿（`expand-greenfield-python-skeleton.test.ts`）。
2. **`verify_imports`**：PRD §5.6 规则 #6 — 已实现于 `verify-python-test-imports.mjs`（pre-impl soft-skip；`--strict` 严格档）；M5 stub 后可默认 `--strict`。
3. **生成成功率**：§14 分层 — 全量 JSON 过渡档 2/3；骨架模板上线后 5/5 连续进入执行。

## 参考

- `autoAI/packages/stagent-core/src/runtime-replan/constants.ts`
- `autoAI/packages/stagent-core/src/GlobalDecisionContext.ts`
- `autoAI/docs/t4-live-iteration-log.md`
