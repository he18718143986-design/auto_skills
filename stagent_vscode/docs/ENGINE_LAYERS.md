# 引擎分层职责

> 装配根：`src/engine-wiring/createWorkflowEngineParts.ts`  
> Gate ID：`src/QualityGateIds.ts`（21 个内置 id，含 `impl-write-scope`）  
> 产品层双轨 / Charter / Gate 清单：`../stagent_docs/B-ROUTE-SOLUTION.md` §6–§8  
> 最后更新：2026-06

本文档描述 **WorkflowEngine 主干四层** 与 **横切域模块** 的职责边界。主干层回答「谁装配、谁缓存 Host、谁对外暴露 API」；横切域回答「Charter / 质量门 / 执行器 / 生成链落在哪里」。

---

## 1. 主干四层（Facade → HostFactories）

| 层 | 一句话职责 | 代表模块 |
|----|------------|----------|
| **Facade** | 对外稳定 API：instance / generation / execution / hitl / artifact，委托给服务与缓存 Host | `WorkflowEngine.ts`、`engine-facades/*` |
| **Internals** | 门面下的共享脊柱：诊断、执行深度、`EngineHostFactoryBuilder` | `WorkflowEngineInternals.ts` |
| **Registry** | 按 deps 快照懒构建并缓存组合 Host（stage / start / hitl / artifact / path） | `WorkflowEngineHostRegistry.ts` |
| **HostFactories** | 纯装配：从 `EngineHostFactoryDeps` 四切片构造角色 Host | `WorkflowEngineHostFactories.ts`、`engine-host/*` |

### 依赖方向（只允许向下）

```
extension.ts
  → createWorkflowEngineParts()          # Composition Root
       → WorkflowEngine (Facade)
            → Internals
            → HostRegistry → HostFactories → StageExecutionHost / HitlCoordinatorHost / …
       → WorkflowUiBridge / LlmClient / WorkflowInstanceManager / WorkflowGenerationService
```

- **引擎核心**（`src/` 除 `adapters/`、`webview/`、`extension.ts`）应避免直接 `import vscode`（架构守卫：`architecture-no-core-vscode.test.ts`）。
- **VS Code 边缘**：`adapters/`、`webview/`、`panel-handlers/`。

### ISP 四切片（`EngineHostFactoryDeps`）

| 切片 | 职责 |
|------|------|
| `MessagingHostDeps` | postMessage、debugLog、warn、degraded、logUserAction |
| `PersistenceHostDeps` | instance 指针、scheduleSave、路径解析 |
| `GenerationHostDeps` | polish/clarify/generate、normalize、LLM raw |
| `ExecutionHostDeps` | executeNextStage、depth、HITL 执行钩子 |

Runner 按角色只依赖子接口（`PreGenerationHostDeps`、`HitlHostDeps` 等），见 `architecture-interface-ceiling.test.ts`。

---

## 2. 横切域模块（非四层，但与执行链正交）

这些目录**不替代** Facade/Registry，而是在生成或执行链上被 Host / Runner 调用。

| 域 | 职责 | 目录 / 入口 |
|----|------|-------------|
| **生成链** | polish → clarify → LLM JSON → normalize → post-parse validation | `WorkflowGenerationService.ts`、`WorkflowGeneration.ts`、`generation-validation/` |
| **执行循环** | 线性 `StageStepDriver` 或 DAG `DagWaveScheduler` | `executor-loop/`、`WorkflowExecutorLoop.ts` |
| **Stage 执行器** | 单 stage：llm-text / code-runner / file-* | `stage-runners/`、`non-llm-runners/` |
| **质量门** | generate / pre-stage / post-stage / workflow-end | `QualityGate.ts`、`quality-gates/*`、`BuiltinQualityGates.ts` |
| **磁盘 bootstrap** | self-heal、smoke、bundle 落盘、软件管线注入 | `disk-bootstrap/`、`workflow-self-heal/`、`WorkflowDiskBootstrap.ts` |
| **Contract-First** | 三层合同 + 两级 Preflight + 诊断路由（feature flag 灰度） | `contract-infra/`、`plan-preflight/`、`commitment/`、`runtime-preflight/`、`diagnostic-router/` |
| **持久化** | 实例 catalog、`.wf-state.json`、resume | `WorkflowInstanceManager.ts`、`instance/`、`instance-repo/` |
| **可观测性** | traceId、degraded、metrics、session log | `WorkflowEngineDiagnostics.ts` |

---

## 3. 双轨与产品层模块（轨道 A / B）

双轨不是新的 Facade，而是**同一执行链上的两类把关策略**。详见 `B-ROUTE-SOLUTION.md` §6。

| 轨道 | 含义 | 引擎落点 |
|------|------|----------|
| **A · 客观验证** | code-runner / exit 0 / 契约 lint → 自动走 | `quality-gates/preStageGates.ts`、`CodeRunnerCommandLint`、`verificationConfidence.ts`、`verificationFlaky.ts` |
| **B · 主观决策** | DecisionRecord / Charter / 低置信 → HITL | `AdaptiveHITLPolicy.ts`、`charter/*`、`decision-frontload/*`、`hitl/*` |
| **桥接** | 统一 `_confidence` 再判是否 pause | `ConfidenceScorer.ts`、`verificationConfidence.ts` → `shouldPauseAfterStage` |

### Charter（轨道 B · 静态约束）

| 环节 | 模块 |
|------|------|
| 加载 / 解析 | `charter/CharterLoader.ts`、`CharterParser.ts` |
| 每次 llm-text 注入 | `charter/CharterConstraintsBlock.ts` → `StageInputResolutionService.augmentSystemPromptWithGlobalDecisions` |
| Grill 代答 / provenance | `charter/CharterAnswerRouter.ts`、`CharterGrillAutoAnswer.ts` |
| impl 后兜底 warn | post-stage `charter-constraint-warn`（`postStageGates.ts`） |
| 会话结束反馈环 | `charter/maybePromptCharterFeedback.ts`、`CharterWriter.ts` |

### 决策前置（轨道 B · 动态 DecisionRecord）

| 环节 | 模块 |
|------|------|
| 确认页决策板 | `decision-frontload/collectDecisionBoard.ts`、`buildDecisionBoard.ts` |
| frontload 批准写入 | `decision-frontload/applyFrontloadDecisions.ts` |
| 下游注入 | `GlobalDecisionContext.ts`（与 Charter 块串联 append） |

### AFK 无人值守（横跨 A+B）

| 环节 | 模块 |
|------|------|
| 设置预设 | `settings/readers/afk.ts`（覆盖 charter/HITL/verification/sandbox 等） |
| 结束验收 | `afk/evaluateAfkAcceptance.ts`（workflow 结束：零人工干预 + 稳定验证） |

### 友好层（UI 文案，不改执行语义）

`friendly/*`（白话词典、里程碑验收提示）— 仅影响 Webview 展示与 QuickPick 描述。

---

## 4. 质量门在分层中的位置

```
WorkflowGenerationFinalize / orchestratePostParseValidation
  → QualityGateRunner（phase = generate）

executeNextStageLoop
  → runPreGateRegistry（phase = pre-stage）
  → executeStageStep
  → post-stage / workflow-end gates

registerBuiltinQualityGates()  # extension activate
  → generateGates + preStageGates + postStageGates + workflow-end
```

- Gate **id** SSOT：`QualityGateIds.ts`（21 个）。
- Lint **策略**（`DecisionContentLintPolicy`、`ConfigContractLint` 等）被 gate 或 runner **调用**，本身不是 registry id。

### Python 栈 L1/L2 韧性（与 Node 栈 parity）

| 层 | 根因类 | 引擎落点 |
|----|--------|----------|
| **L1** | 第三方 API 幻觉（如 ctpbee `MdApi`） | `PypiSymbolHints.ts` + `WriteOutputNormalize`（`.py` strip）；`python-pypi-symbol` pre-gate（`hard` 可配，AFK 默认 hard）；prompt / DecisionRecord §7 |
| **L2 生成期** | venv 链合并、缺 conftest、test/impl 符号不对齐 | `pythonTestInfraChecks.ts`（plan-completeness）；`PythonExportContractLint.ts`；`splitBundledVenvPipImportCommands` |
| **L2 执行前** | pytest 路径 / venv 未就绪；test/impl 符号 | `TestRunPreflight`；`python-export-contract` / `python-pypi-symbol` gate（AFK 默认 hard）；`gate-repair/`（block → LLM 修一次并重试 gate）；`PYTHONPATH=.` |
| **L2 bootstrap** | flat layout 无 `sys.path` | `python-bootstrap/conftestTemplate.ts`；`disk-bootstrap/pythonConftestStage.ts`；preflight auto-fix |
| **L3 可读性** | pytest 失败分类 | `test-run-playbook/rules-import.ts`：`pytest-path-missing` / `pytest-symbol-missing` / `pytest-third-party-api` |

旧 workflow 实例：`normalizeWorkflow` / `startExecution` 入场跑 `applyPythonWorkflowRepairs`（拆分 `stage_venv_init` 链，不改 wf-state 历史 id）。

**P3 运行时改 DAG（P3b 已接 executor）**：`docs/RUNTIME_REPLAN_SPEC.md` · `tryRuntimeReplanFromGateBlock` · `PreGateOutcome.replan`

---

## 5. llm-text 上下文拼装（跨 Charter + GlobalDecision）

不属于单独一层，固定在 **Stage 执行前**（`StageInputResolutionService`）：

```
stage.toolConfig.systemPrompt
  → appendGlobalDecisionContextToSystemPrompt()   # 已批准 DecisionRecord
  → augmentSystemPromptWithCharterConstraints()   # Charter avoid + constraint 全量
```

---

## 6. 工具类型与 Runner 分层

| tool | Runner | 说明 |
|------|--------|------|
| `llm-text` | `stage-runners/` | 含 WriteOutputNormalize、ConfidenceScorer |
| `code-runner` | `StageCodeRunnerService` + `non-llm-runners/code-runner.ts` | 含沙箱、verificationConfidence |
| `file-write` / `file-read` | `non-llm-runners/` | |
| `user-prompt` | — | schema 有定义，**执行器未实现**；用 HITL / question 代替 |

---

## 7. 相关文档

| 问题 | 查阅 |
|------|------|
| 快速数字与文件定位 | `QUICK_REFERENCE.md` |
| 数据流图 | `ARCHITECTURE_FLOWS.md` |
| 类型与消息协议 | `ARCHITECTURE_INTERFACES.md` |
| 风险与统计 | `ARCHITECTURE_ANALYSIS.md` |
| 双轨 / Gate 全表 | `../stagent_docs/B-ROUTE-SOLUTION.md` §6–§8 |
| 沙箱平台边界 | `docs/SANDBOX_PLATFORMS.md` |
