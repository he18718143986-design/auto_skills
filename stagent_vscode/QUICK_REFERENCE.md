# Stagent 架构 - 快速参考指南

> 📍 **位置**：项目根目录
> - `ARCHITECTURE_ANALYSIS.md` — 完整架构分析 + 风险评估
> - `ARCHITECTURE_FLOWS.md` — 数据流和可视化流程图
> - `ARCHITECTURE_INTERFACES.md` — 关键接口和通信协议
> - `docs/ENGINE_LAYERS.md` — 引擎分层 + 横切域（Charter / 质量门 / 双轨 / AFK）
> - `docs/webview-testing.md` — Webview 集成测与时间线 harness 策略
> - `../stagent_docs/B-ROUTE-SOLUTION.md` — 产品层双轨把关、Charter、Gate 清单（与代码同步维护）
> - `QUICK_REFERENCE.md` — 本文件

---

## 🎯 项目本质

**Stagent** = AI 驱动的**多阶段工作流引擎** VS Code 扩展（**双轨把关**：客观验证自动走 + 主观决策 HITL）

```
用户需求 → LLM 生成工作流 → 按阶段执行（llm-text / code-runner / file-*）
         → 质量门（generate / pre / post / workflow-end）
         → 低置信 / 决策 / 越界时 HITL → 完成
```

---

## 📊 关键数字

| 指标 | 数值 |
|------|------|
| 源文件（`src/`，不含 test） | ~686 个 `.ts` |
| 测试文件（`src/test/`） | ~255 个 `.test.ts` |
| 单元测试 | ~1200+ case（`npm run test:unit`） |
| 集成测试 | 12（文件名含 `integration`） |
| 核心引擎 | `WorkflowEngine` + 5 门面 |
| 工具类型 | 类型 5 种；**可执行 4 种**（`user-prompt` 未实现，人工介入走 HITL / question） |
| 内置 QualityGate ID | **20**（`src/QualityGateIds.ts` · `BUILTIN_QUALITY_GATE_IDS`） |
| 错误类型 | 17+（含 sandbox-* / confidence-too-low） |
| 最小 VS Code 版本 | 1.85.0 |
| 扩展版本 | 0.7.0 |

---

## 🏗️ 核心模块

```
WorkflowEngine（薄门面，~66 行）
├─ instances   → WorkflowInstanceFacadeImpl
├─ generation  → WorkflowGenerationService
├─ execution   → WorkflowExecutionFacadeImpl
├─ hitl        → WorkflowHitlFacadeImpl
└─ artifacts   → WorkflowArtifactFacadeImpl

装配根：engine-wiring/createWorkflowEngineParts.ts
├─ WorkflowInstanceManager（实例 + 持久化）
├─ WorkflowGenerationService（生成链）
├─ WorkflowEngineHostRegistry（缓存宿主）
├─ WorkflowEngineInternals（诊断 + 工厂构建）
├─ WorkflowEngineDiagnostics（日志/指标/degraded）
└─ WorkflowUiBridge（Webview 消息 + 副作用链）
```

### 主要文件定位

| 功能 | 文件 | 约行数 |
|------|------|--------|
| 扩展入口 | `src/extension.ts` | 47 |
| 中央编排门面 | `src/WorkflowEngine.ts` | 66 |
| 依赖装配 | `src/engine-wiring/createWorkflowEngineParts.ts` | 236 |
| 生成服务 | `src/WorkflowGenerationService.ts` | 187 |
| LLM 调用 | `src/LlmClient.ts` | 455 |
| 质量门框架 | `src/QualityGate.ts` + `quality-gates/*` + `BuiltinQualityGates.ts` | — |
| 执行宿主 | `src/StageExecutionHost.ts` | 117 |
| 执行循环 | `src/executor-loop/` + `WorkflowExecutorLoop.ts` | — |
| 消息类型 | `src/workflow-types/MessageTypes.ts` | 177 |
| UI 桥接 | `src/WorkflowUiBridge.ts` | 107 |
| Charter / 决策注入 | `src/charter/*` + `src/GlobalDecisionContext.ts` + `StageInputResolutionService.ts` | — |
| 决策前置 / AFK | `src/decision-frontload/*` + `src/afk/*` | — |
| VS Code 适配器 | `src/adapters/*.ts` | 多文件 |
| 沙箱能力矩阵 | `src/sandbox/SandboxCapabilityMatrix.ts` | — |
| HITL 状态 SSOT | `src/WorkflowStateTransitions.ts` | guarded 迁移 |

---

## 🔄 3 大流程

### 1️⃣ 生成流程（15–30s）

```
输入需求 + taskWorkspacePath
  ↓
Polish（LLM 优化，可缓存）
  ↓
Clarify（LLM 问卷 + 已有文件策略）
  ↓
Generate（LLM 生成工作流）
  ↓
Parse JSON → Normalize → 质量门（generate 阶段）
  ↓
workflowGenerated → 确认页
```

**关键点**：
- 预执行 draft shell 在 polish/clarify/generate 前创建，复用 `traceId`
- 生成序号 `getGenerationSeq()` 防竞态；supersede 时 `degraded('generation_superseded_swallow')`
- 上下文/ADR/快照失败走 `diagnostics.degraded()`，不再 `console.warn` 静默

### 2️⃣ 执行流程（线性或 DAG）

```
executeNextStageLoop（线性 StageStepDriver / DAG DagWaveScheduler）
  For each stage / wave:
    1. 预检验（pre-stage quality gates）
    2. 输入解析（resolveInput + InputContextPolicy 预算）
    3. 工具执行（executeStageStep → llm-text / code-runner / file-write / file-read）
    4. 后检验（post-stage gates）
    5. HITL（guardedStageTransition → paused / waiting-questions）
    6. scheduleSave → 下一阶段
```

**关键点**：
- llm-text 的 systemPrompt 依次 append：**已批准 DecisionRecord**（`GlobalDecisionContext`）→ **Charter avoid/constraint**（`CharterConstraintsBlock`）
- test_run / smoke exit 0 → `verificationConfidence` 写入 `_confidence`（与 `ConfidenceScorer` 并列，见 `quality-gates/verificationConfidence.ts`）
- 状态迁移经 `WorkflowStateTransitions.guardedStageTransition` / `guardedInstanceTransition`
- DAG 调度退出、线性 skip、resume 失败、instanceSwitchBlocked 均写 debug 事件
- code-runner 沙箱：`sandbox.enabled` 且无内核隔离时 **fail-closed**（见 `SandboxCapabilityMatrix`）；`sandbox.verificationOnly` 可仅对 test_run/smoke 走沙箱

### 3️⃣ 持久化流程

```
内存 WorkflowInstanceManager.instance
  ↓ scheduleSave()（防抖 200ms）
  ↓
磁盘 <workspace>/.stagent/instances/<key>/.wf-state.json
  ↓ 同步
  ↓
VS Code globalState（备用索引）
```

**日志域（可用 traceId 关联）**：

| 域 | 路径 / purpose | 用途 |
|----|----------------|------|
| per-task debug | `<taskDir>/.wf-debug.log` | 阶段/调度/HITL 事件 |
| session log | `<globalStorage>/.session-debug.log` | 生成前 LLM、diagnostics、metrics |
| failures | `<taskDir>/.wf-failures.jsonl` + `failure-logs/failures.jsonl` | stageError 结构化失败 |

---

## 🔌 关键接口

### EngineHostFactoryDeps（ISP 四切片聚合）

定义于 `src/engine-host/index.ts`，由 `EngineHostFactoryBuilder` 在运行时满足：

| 切片 | 文件 | 职责 |
|------|------|------|
| `MessagingHostDeps` | `MessagingHostDeps.ts` | postMessage、debugLog、warn、**degraded**、logUserAction |
| `PersistenceHostDeps` | `PersistenceHostDeps.ts` | instance 指针、scheduleSave、路径解析 |
| `GenerationHostDeps` | `GenerationHostDeps.ts` | polish/clarify/generate、LLM raw、normalize |
| `ExecutionHostDeps` | `ExecutionHostDeps.ts` | executeNextStage、depth、HITL 执行钩子 |

消费方按角色取子集：`PreGenerationHostDeps`、`GenerationRunnerHostDeps`、`HitlHostDeps`、`StartExecutionHostDeps` 等（≤25 成员，见 `architecture-interface-ceiling.test.ts`）。

### WorkflowEngineExecutionHost（执行窄接口）

定义于 `src/execution-bindings/types.ts`，由 `StageExecutionHost` 实现：

```typescript
// 四块组合
ExecutionMessagingHost  // postMessage, debugLog, scheduleSave, logUserAction
ExecutionLlmHost          // resolveInput, executeLlmText, applyPatchInstructions
ExecutionPathHost         // resolveOutputPath, ensureTaskDir, trackPersistedFile
ExecutionQualityHost      // runCodeRunner, runWorkspaceContractLint, runSdkPathContractHardGate
```

执行循环入参 `ExecuteNextStageLoopParams` 同样拆为 `Execution*Slice`（`executor-loop-types.ts`）。

### WorkflowEngineDiagnostics

```typescript
diagnostics.warn(message)           // 横切告警 → OutputChannel + session log
diagnostics.degraded(reason, ctx)   // best-effort 降级 → session log + .wf-debug.log
diagnostics.debugLog(...)           // per-task 轨迹
diagnostics.flushMetrics(reason)    // 任务结束 metrics 快照（含 traceId）
```

---

## 📝 WorkflowDefinition 核心字段

```typescript
{
  version: '2.0',
  id: 'wf_XXXXXXXX',
  meta: {
    title, taskType, userInput, createdAt,
    isGreenfield?, taskWorkspacePath?,  // 用户选定的工作文件夹
    userInputPolish?,                    // 润色溯源
  },
  stages: [{
    id: 'stage_impl_1',
    tool: 'llm-text' | 'code-runner' | 'file-write' | 'file-read' | 'user-prompt', // user-prompt：schema 有，执行器未实现
    toolConfig: { ... },
    input: { sources: [...], mergeStrategy: 'concat' | 'template' | 'object' },
    outputs: [{ key, format }],
    pauseAfter: boolean,
    dependsOn?: string[],   // DAG
    onError?: { strategy: 'retry'|'fail'|'pause'|'skip', maxRetries? },
  }],
  globalConfig?: { enableDagScheduler?: boolean },
}
```

`WorkflowInstance.traceId` 为单次运行的关联 id，从 draft shell 贯穿到 debug / session / metrics / stageError。

---

## ⚖️ 双轨与子系统（产品层）

| 轨道 | 机制 | 源码 |
|------|------|------|
| **A · 客观验证** | test_run / smoke / verify_* → exit 0 → 自动走 | `quality-gates/preStageGates.ts`、`verificationConfidence.ts` |
| **B · 主观决策** | decide_* / Charter / 低置信 → HITL | `AdaptiveHITLPolicy.ts`、`charter/*`、`decision-frontload/*` |
| **磁盘 bootstrap** | self-heal / smoke / bundle 落盘 | `disk-bootstrap/*`、`workflow-self-heal/*` |
| **AFK 无人值守** | 预设覆盖设置 + 结束验收 | `afk/evaluateAfkAcceptance.ts`、`settings/readers/afk.ts` |

完整 Gate ID 与两轨说明见 [`../stagent_docs/B-ROUTE-SOLUTION.md`](../stagent_docs/B-ROUTE-SOLUTION.md) §6–§8。

---

## 🚨 常见风险点（TOP 5）

### 1. DAG 并行与执行深度

`executionDepth` 在 `executeNextStage` 入口维护；DAG wave 并行时须保证 depth 配对。调度退出须可查（`dag_scheduler_exit` 事件）。

### 2. 全局状态同步失败

磁盘写入成功后 `globalState` 失败 → `onGlobalStateFailed` + `actionHint`；持久化桥接用 `degraded('state_file_persist_failed')`。

### 3. 沙箱「看似隔离」

仅 darwin + `sandbox-exec` 为真实内核边界；Linux/Win 为软约束。`sandbox.enabled` 且无 enforced 能力时拒绝执行（fail-closed）。

### 4. 输入上下文溢出

`InputTruncationPolicy` 抛出 `StagentError`（`llm-context-overflow`）；对关键 source 设 `required=true`。

### 5. HITL 状态散落

所有 `stageRuntime.status` / `instance.status` 变更应经 `guardedStageTransition` / `guardedInstanceTransition`（非法边抛错 + 日志）。

---

## 🧪 测试覆盖

| 类别 | 代表文件 |
|------|----------|
| 生成 | `workflow-generation-service.test.ts` |
| 执行 / DAG | `workflow-executor-dag.test.ts`, `dag-stuck-and-end-lint.test.ts` |
| HITL | `hitl-safety-gates.test.ts`, `hitl-transition-guard.test.ts` |
| 沙箱 | `sandbox-capability.test.ts`, `sandbox-executor.test.ts` |
| 架构守卫 | `architecture-no-core-vscode.test.ts`, `architecture-interface-ceiling.test.ts`, `engine-headless-construct.test.ts` |
| 可观测性 | `trace-correlation.test.ts`, `trace-completeness.test.ts` |
| 持久化 | `workflow-engine-persistence-bridge.test.ts` |

> 注：`sandbox-executor.test.ts` 内核用例在 Cursor 嵌套沙箱中可能失败，在宿主环境外运行可通过。

Webview 集成测与时间线 harness 约定见 [`docs/webview-testing.md`](docs/webview-testing.md)。

---

## Webview 开发约定

### 新增 BackendMessage 枚举值

在 `RuntimeTypes.ts` 维护 `*_VALUES` 常量数组（SSOT），类型由 `typeof XXX_VALUES[number]` 派生。不要在 schema 脚本或 webview 端单独维护字符串列表。

### 非法 stageStatus 处理

写入口（`coerceExecStageStatus`）warn + 回退 `pending`。测试断言 `console.warn` 被调用，不在 test 里 throw。

### scheduleUiRefresh context 合并

同一 rAF 帧内多次传入同字段：last-write-wins（仅显式传入时覆盖）。未传字段保留先前值。见 `uiRefreshSchedulerCore.ts` 注释。

### 消息顺序与 resync（seq + uiEpoch + instanceKey）

| 层 | 机制 |
|----|------|
| Extension | `WorkflowUiBridge` 同步递增 `seq`；`beginUiResync()` 重置 outbound `deliveryChain` 并递增 `uiEpoch` |
| Recovery | `pushRecoveryUi` / `resyncPanelUi` 在 burst 前**必调** `beginUiResync()` |
| Webview | `backendMessageInstanceGate`（instanceKey）+ `stageStatusStore`（seq）+ `uiEpochGate`（uiEpoch） |
| 兜底 | Webview 重载 → `webviewReady` → `resyncPanelUi` 重放 `instanceResumed` 快照 |

**uiEpoch 宽松模式（过渡期）：** `uiEpoch == null` 的消息仍放行；`uiEpoch < lastAccepted` 丢弃。Bridge 全路径注入完成后，将 `UI_EPOCH_GATE_STRICT` 改为 `true`（见 `uiEpochGate.ts` 注释）。

---

## 💡 设计模式

| 模式 | 例子 |
|------|------|
| **Facade** | 5 门面隐藏 `createWorkflowEngineParts` 装配细节 |
| **ISP + DI** | `EngineHostFactoryDeps` 四切片；各 runner 只依赖子接口 |
| **Composition Root** | `createWorkflowEngineParts`；唯一循环缝 `executeNextStageRef` |
| **Adapter** | `src/adapters/` 隔离 VS Code API（设置、toast、取消检测） |
| **State Machine** | `WorkflowStateTransitions` guarded 迁移表 |
| **Registry** | `WorkflowEngineHostRegistry` 缓存宿主；`BuiltinQualityGates` |
| **Typed Error** | `StagentError.errorType`；`classifyThrownError` 优先读类型 |

---

## 📚 文档导航

| 问题 | 查阅 |
|------|------|
| 什么是 Stagent？ | 本文 🎯 |
| 层职责 / Charter / 双轨落点？ | `docs/ENGINE_LAYERS.md` |
| 如何添加质量门？ | `ARCHITECTURE_INTERFACES.md` §7 |
| 数据如何流动？ | `ARCHITECTURE_FLOWS.md` §1 |
| 消息协议？ | `ARCHITECTURE_INTERFACES.md` §3 |
| Webview 测试 / 时间线 harness？ | `docs/webview-testing.md` |
| Webview 开发约定（enum / stageStatus / scheduler）？ | 本文 § Webview 开发约定 |
| 主要风险？ | `ARCHITECTURE_ANALYSIS.md` §风险点 |
| 执行循环？ | `ARCHITECTURE_FLOWS.md` §3 |
| 双轨 / Charter / Gate 清单？ | `../stagent_docs/B-ROUTE-SOLUTION.md` §6–§8 |
| 内置 Gate ID？ | `src/QualityGateIds.ts` |

---

## 🔧 常见开发任务

### 添加新质量门

1. 在 `src/QualityGateIds.ts` 增加 `GATE_ID_*` 并加入 `BUILTIN_QUALITY_GATE_IDS`
2. 在 `src/quality-gates/{generate,preStage,postStage}Gates.ts` 定义 gate
3. 经 `registerBuiltinQualityGates()` 注册；`QualityGateRunner` 按 phase/priority 执行

测试：`src/test/builtin-quality-gates.test.ts`。

### 添加引擎降级点

```typescript
host.degraded('my_site_failed', { err: String(e), ...ctx });
// 禁止在引擎路径使用 console.warn（eslint no-restricted-syntax）
```

### 调试单次运行

```bash
# 给定 traceId 串联：
grep trace_<uuid> <globalStorage>/.session-debug.log
grep trace_<uuid> <taskDir>/.wf-debug.log
```

---

## 🌟 核心概念速查

| 概念 | 解释 |
|------|------|
| **traceId** | 单次运行关联 id（draft shell → 执行 → HITL → 完成） |
| **sessionId / instanceKey** | Webview 缓存的活跃实例指针（同值） |
| **degraded** | best-effort 继续但能力受损；结构化落盘 |
| **sandboxEnforced** | 是否具备可依赖的内核级隔离 |
| **guardedTransition** | HITL/执行状态迁移 SSOT |
| **StagentError** | 带 `errorType` 的引擎错误；分类不依赖 message 措辞 |
| **双轨** | 轨道 A（可执行验证）+ 轨道 B（决策/Charter/HITL） |
| **verificationConfidence** | test_run/smoke exit 0 → `_confidence` ≈ 0.92/0.95 |

---

## 📞 常见问题

**Q: WorkflowEngine 是单例吗？**
A: 扩展 `activate` 时创建一个实例，sidebar 与 panel 共享。

**Q: 如何支持多并发工作流？**
A: 当前仅一个活跃 `currentInstanceKey`；切换受 `ActiveInstanceGuard` + `instanceSwitchBlocked` 约束。

**Q: HITL 暂停后数据会丢吗？**
A: 不会。`scheduleSave` / `persistMilestone` 持久化至 `.wf-state.json` 与 globalState。

**Q: 引擎核心能 headless 构造吗？**
A: 可以。`engine-headless-construct.test.ts` 验证 `createWorkflowEngineParts` 无 Webview 依赖装配。

---

**最后更新**：2026-06

**维护者**：Stagent Team
