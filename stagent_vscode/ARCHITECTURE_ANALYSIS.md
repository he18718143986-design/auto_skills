# Stagent VS Code 扩展项目 - 架构分析

## 📊 项目概览

这是一个 **AI 驱动的工作流引擎** VS Code 扩展，核心目标是：
- 将用户需求转化为**结构化工作流**（多阶段执行流）
- 通过 **LLM 生成**工作流步骤
- **编排代码执行、文件操作、HITL（Human-In-The-Loop）**等多种工具
- **双轨把关**：轨道 A（code-runner 客观验证自动走）+ 轨道 B（DecisionRecord / Charter / 低置信 HITL）
- 提供**质量门**（18 个内置 gate id，见 `QualityGateIds.ts`）和**风险检测**机制

**版本**：0.7.0 | **最小 VS Code 版本**：^1.85.0 | **最后更新**：2026-06

相关文档：`QUICK_REFERENCE.md`、`ARCHITECTURE_INTERFACES.md`、`ARCHITECTURE_FLOWS.md`、`docs/ENGINE_LAYERS.md`、`../stagent_docs/B-ROUTE-SOLUTION.md`（产品层双轨 / Charter / Gate 清单）

---

## 🏗️ 核心架构设计

### 整体数据流

```
用户交互 (Sidebar/Webview)
    ↓
├─ 新建任务 → panelFactory + engine.generation
├─ 已有实例 → WorkflowInstanceManager.resume / offerRecoverableInstance
└─ 用户编辑 → WorkflowPanelMessageRouter → engine.* 门面
    ↓
WorkflowEngine (薄门面，装配自 createWorkflowEngineParts)
    ├─ 生成阶段：WorkflowGenerationService
    │  ├─ 需求优化（polish）
    │  ├─ 澄清问题（clarify questions）
    │  └─ LLM 生成工作流 → WorkflowDefinition
    │     ↓
    │  ├─ 解析 JSON
    │  ├─ 标准化（normalize）
    │  ├─ 质量门检验（Quality Gates）
    │  └─ 结构修复（structural repair）
    │
    ├─ 执行阶段：WorkflowExecutorLoop
    │  ├─ 读取阶段输入（input sources）
    │  ├─ 质量门前检验（pre-stage gates）
    │  ├─ 调用执行宿主：
    │  │  ├─ LLM 文本生成
    │  │  ├─ 代码执行（code-runner）
    │  │  ├─ 文件读写
    │  │  ├─ 用户输入
    │  │  └─ 文件读取
    │  ├─ 质量门后检验（post-stage gates）
    │  ├─ HITL 协调（暂停、审核、重试）
    │  └─ 结果保存 + 状态更新
    │
    └─ 持久化层：WorkflowInstanceManager
       ├─ 实例目录管理（catalog）
       ├─ 磁盘持久化（persistence）
       ├─ 全局状态同步（VS Code globalState）
       └─ 恢复协调（resume）
    ↓
WorkflowUiBridge (UI 桥接)
    ├─ Webview postMessage
    ├─ Sidebar 任务列表刷新
    └─ 状态变更通知
    ↓
UI 渲染 (Webview React 组件)
    ├─ 生成输入界面（GenerationInput）
    ├─ 工作流确认面板（ConfirmPlan）
    ├─ 阶段执行进度（StageProgress）
    ├─ HITL 交互（暂停确认、重试、问卷）
    └─ 最终结果展示
```

---

## 📁 核心文件夹结构与职责

### 1️⃣ 根层关键模块

| 模块 | 文件 | 职责 |
|------|------|------|
| **入口** | `extension.ts` | 扩展激活、命令、sidebar/panel 引导 |
| **核心门面** | `WorkflowEngine.ts` | 5 门面委托（instances/generation/execution/hitl/artifacts） |
| **装配根** | `engine-wiring/createWorkflowEngineParts.ts` | 集中 DI；LateBound + executeNextStageRef 循环缝 |
| **生成服务** | `WorkflowGenerationService.ts` | polish/clarify/generate、polishCache、generationSeq |
| **生成逻辑** | `WorkflowGeneration.ts` | JSON 解析、normalize、结构修复 |
| **执行** | `WorkflowExecutorLoop.ts` + `executor-loop/` | 线性/DAG 调度、阶段驱动 |
| **LLM** | `LlmClient.ts` | 模型选择、流式、session log |
| **质量门** | `QualityGate.ts` + `BuiltinQualityGates.ts` | generate/pre/post/workflow-end 四阶段 |
| **诊断** | `WorkflowEngineDiagnostics.ts` | warn/degraded/debugLog/flushMetrics |
| **VS Code 适配** | `adapters/*.ts` | 设置读取、toast、取消检测（引擎核心无 runtime vscode） |

### 2️⃣ 关键子目录

```
src/
├─ extension/ExtensionRuntime.ts     # engine + panelFactory 运行时句柄
├─ engine-wiring/                      # 装配根
│  ├─ createWorkflowEngineParts.ts    # WorkflowEngine 全部依赖构造
│  ├─ EngineRuntimeState.ts
│  └─ LateBound.ts                    # 延迟绑定（循环缝辅助）
├─ engine-facades/                     # 5 门面 + Lifecycle
├─ engine-host/                        # EngineHostFactoryDeps 四切片 ISP
├─ execution-bindings/                 # 执行宿主窄接口 + 质量门绑定
├─ executor-loop/                      # DAG/线性调度、StageStepDriver、ExecutorStateContract
├─ instance/                           # Lifecycle / Persistence / Catalog / Draft / Resume
├─ instance-repo/                      # 磁盘读写、purge、mutate
├─ generation/                         # normalizeWorkflowContext、generationGuards、confirmDialogAdapter
├─ hitl/                              # approve/retry/questions + hitlHints
├─ stage-runners/                      # executeStageStep、LLM persist、stage-errors
├─ quality-gates/                      # generate/pre/post/workflow-end 内置 gate
├─ charter/                            # Charter 解析、注入、Grill 代答、反馈环
├─ decision-frontload/                 # 决策前置板（frontloaded decisionMode）
├─ afk/                                # AFK 预设与 workflow 结束验收
├─ friendly/                           # 白话层 / 里程碑验收提示
├─ disk-bootstrap/                     # smoke、delivery、applySoftwarePipeline
├─ workflow-self-heal/                 # injectSelfHealStages（verify/fix 链）
├─ sandbox/SandboxCapabilityMatrix.ts # 平台能力矩阵 + fail-closed 契约
├─ adapters/                           # vscode 边缘（设置、toast、取消、workspace 路径）
├─ workflow-types/                     # Stage/Runtime/Message 类型 SSOT
├─ webview/runtime/                    # 面板运行时（stores、backend-handlers、pause-bar）
├─ panel-handlers/                     # 入站消息路由
├─ paths/StagentPaths.ts               # .wf-state.json / .wf-debug.log 等路径常量
└─ test/                               # ~255 测试文件（含架构守卫、trace、HITL、沙箱）
```

层职责详见 `docs/ENGINE_LAYERS.md`：Facade → Internals → Registry → HostFactories，及 Charter / 质量门 / 双轨横切域。

### 3️⃣ 工作流类型结构（workflow-types/）

```typescript
// StageTypes.ts
type ToolType = 'llm-text' | 'code-runner' | 'file-write' | 'file-read' | 'user-prompt'
// 注：user-prompt 在 schema 中存在，但 non-llm-runners 未实现；人工介入用 isDecisionStage / questionBefore / questionAfter

interface Stage {
  id: string                    // stage_impl_*, stage_test_*, ...
  title: string
  description?: string
  tool: ToolType
  toolConfig: ToolConfig        // Union: LlmTextConfig | CodeRunnerConfig | ...
  input: StageInput             // 输入源 + 合并策略
  outputs: StageOutput[]        # {key, format: 'text'|'markdown'|'json'|'file-path'}
  pauseAfter: boolean           # HITL 暂停标志
  questionBefore?: Question[]   # 工具执行前追问
  questionAfter?: Question[]    # 工具执行后追问
  skipIf?: SkipCondition        # 跳过条件
  onError?: ErrorHandling       # 错误策略 (retry/fail/pause/skip)
  dependsOn?: string[]          # DAG 依赖（启用 DAG 调度时）
}

// RuntimeTypes.ts
type StageStatus = 'pending' | 'running' | 'waiting-questions' | 'paused' | 'done' | 'skipped' | 'error' | 'retrying'

interface StageRuntime {
  stageId: string
  status: StageStatus
  outputs: Record<string, unknown>
  retryCount: number
  questionBeforeAnswers?: Record<string, string>
  questionAnswers?: Record<string, string>
  approvedDecisionRecord?: string
  lastError?: {error, errorType: ErrorType, stdout?, stderr?}
}

interface WorkflowInstance {
  traceId?: string                    // 运行关联 id（debug/session/metrics）
  definition: WorkflowDefinition
  currentStageIndex: number
  stageRuntimes: StageRuntime[]
  status: 'idle' | 'running' | 'paused' | 'completed' | 'failed'
  taskDir?: string
  artifactRegistry?: Artifact[]
}
```

---

## 🔄 核心流程详解

### 流程 1：从用户输入到工作流生成

```
1. 用户在 Sidebar 点击「新建任务」
   → ExtensionCommands.ts: stagent.newTask 命令
   
2. 打开 Webview 输入面板
   → `webview/runtime/view-input.ts` 等运行时视图
   
3. 用户点击生成
   → `engine.generation.generateWorkflow()`（经 panel-handlers 路由）
   
4. Pre-Generation 阶段
   ├─ handlePolishUserTask()          # Polish 需求（LLM 优化）
   ├─ handleGenerateClarifyQuestions() # Clarify 澄清问题
   └─ 缓存结果（polishCache）
   
5. LLM 生成工作流（LLM 调用循环）
   ├─ LlmClient.invokeLlmStreaming()  # 模型选择 + 流式调用
   ├─ JSON 提取（extractJsonObject）  # 从文本中提取 JSON
   ├─ 工作流解析（parseWorkflowJson） # 验证 JSON 结构
   └─ 截断处理（LlmParseRetryLoop）  # 如果截断，续接调用
   
6. 工作流标准化（normalizeWorkflow）
   ├─ 确保决策阶段（ensureSoftwareWorkflowHasDecisionStage）
   ├─ 规范化决策阶段形状（normalizeDecisionStage）
   ├─ 分割 bundled 测试命令（splitBundledTestRunCommands）
   ├─ 应用 Rule20 标准化（applyRule20StructuralNormalizations）
   └─ 标准化代码运行超时
   
7. 质量门检验（generate 阶段 · QualityGateRegistry）
   ├─ schema-validation / rule20-violations / plan-completeness（block）
   ├─ generator-meta-warnings / dependency-graph-warnings / complexity-warnings（warn）
   ├─ prototype-data-contract / static-analysis-on-generate（warn）
   └─ 另：DecisionContentLintPolicy、ConfigContractLint 等 lint 被上述 gate 或执行链调用（非 gate id）
   
8. 结构修复（StructuralRepair）
   ├─ 修复缺失的输出声明
   ├─ 修复文件读取路径
   └─ 修复跳过条件
   
9. 生成完成 → `workflowGenerated` 消息
   → 确认页（`webview/runtime/view-confirm.ts`）
```

### 流程 2：从确认到执行

```
1. 用户确认工作流
   → `approveDecision` → `engine.hitl` / `startExecution`
   
2. 创建工作流实例
   ├─ WorkflowInstance 初始化（复用 draft shell traceId）
   ├─ taskDir 创建（`<workspace>/.stagent/instances/<key>/` 或用户指定路径）
   └─ WorkflowInstanceManager.scheduleSave → `.wf-state.json`
   
3. 启动执行循环（executeNextStageLoop）
   
4. 对于每个阶段（按 currentStageIndex）：
   
   a) 阶段前准备
      ├─ 读取阶段定义（stages[currentStageIndex]）
      ├─ 获取阶段运行时信息
      └─ 检查跳过条件（skipIf）
   
   b) 输入解析（resolveInput）
      ├─ 遍历 input.sources
      ├─ 根据 sourceType (stage-output/user-input/file/constant) 读取值
      ├─ 按 mergeStrategy 合并（concat/template/object）
      ├─ 上下文压缩（InputContextPolicy）- 自动降级至模型限制
      └─ 生成最终 userContent
   
   c) 质量门前检验（pre-stage gates · 见 QualityGateIds.ts）
      ├─ red-green-pre-impl / test-run-preflight / test-run-deps-install
      ├─ sdk-path-contract-hard / requirements-txt-preflight
      ├─ debug-feedback-loop（debug taskType）
      └─ test-run-contract-lint（warn）
   
   d) 工具执行（通过 StageExecutionHost）
      ├─ LLM 文本生成 (StageLlmDelegate)
      │  ├─ augmentSystemPrompt：已批准 DecisionRecord + Charter avoid/constraint
      │  ├─ LlmClient.executeLlmText()
      │  ├─ 流式输出推送到 UI
      │  └─ OutputQualityScorer → ConfidenceScorer → `_confidence`
      │
      ├─ 代码执行 (StageCodeRunnerService)
      │  ├─ 工作目录解析
      │  ├─ 命令验证（CodeRunnerCommandLint）
      │  ├─ 沙箱执行（SandboxExecutor；verificationOnly 可仅 test_run/smoke）
      │  ├─ 输出捕获（exitCode/stdout/stderr）
      │  ├─ test_run/smoke exit 0 → verificationConfidence
      │  └─ 超时处理 / serve 有界 smoke（B-Q1）
      │
      ├─ 文件写入 (non-llm-runners/file-write)
      │  ├─ 从前置阶段读取 sourceOutputKey
      │  ├─ 文件原子写入
      │  └─ 工件注册（ArtifactLifecycleManager）
      │
      └─ file-read（non-llm-runners/file-read）
   
   e) 质量门后检验（post-stage gates）
      ├─ charter-constraint-warn（impl 产出 Charter 命中）
      ├─ post-impl-static-analysis（可选）
      └─ workflow-end：run-end-contract-lint
   
   f) HITL 协调（engine.hitl + WorkflowStateTransitions）
      ├─ pauseAfter → guardedStageTransition(rt, 'paused', ...)
      ├─ questionBefore/After → guardedStageTransition(rt, 'waiting-questions', ...)
      └─ UI：stageStatusUpdate / stageQuestions(Before)
   
   g) 错误处理（onError 策略）
      ├─ 'retry': 重新执行（maxRetries 次）
      ├─ 'fail': 中止工作流
      ├─ 'pause': 暂停，等待人工审查
      └─ 'skip': 跳过本阶段
   
   h) 结果持久化
      ├─ 更新 stageRuntime.outputs
      ├─ 更新 stageRuntime.status
      ├─ 增量保存（WorkflowInstanceManager.scheduleSave()）
      └─ 推送 UI 消息（postMessage）
   
   i) 递进游标
      └─ currentStageIndex++，回到 a)

5. 工作流完成
   ├─ 状态转为 'completed'
   ├─ 质量门结束检验（workflow-end gates）
   ├─ 生成工作流摘要（WorkflowPlanSummary）
   └─ 显示最终结果面板
```

### 流程 3：HITL 与暂停

```
pauseAfter = true 的阶段执行后：

1. 状态转为 'paused'
   
2. UI 显示「审核阶段结果」面板
   ├─ 展示阶段输出
   ├─ 显示 aiTip（生成器提供的审核建议）
   └─ 提供 Approve/Retry/AnswerQuestions 按钮

3. 用户操作

   a) Approve (handleApprove)
      ├─ 标记工件为已审核（markStageArtifactsApproved）
      ├─ 状态转为 'done'
      └─ 继续下一阶段
   
   b) Retry (handleRetry)
      ├─ 清空本阶段 output
      ├─ 重置 retryCount++
      ├─ 如果 retryComment，保存注释
      └─ 重新执行本阶段
   
   c) AnswerQuestions (handleAnswerQuestions)
      ├─ 用户填写 questionBefore 问卷
      ├─ 答案保存至 stageRuntime.questionBeforeAnswers
      └─ 重新执行本阶段（带问卷上下文）
```

---

## 🎯 主要模块间的依赖关系

### 依赖关系图

```
extension.ts (激活入口)
    ├─ WorkflowEngine (中央编排器)
    │  ├─ WorkflowInstanceManager (实例生命周期)
    │  │  ├─ InstanceLifecycle
    │  │  ├─ InstancePersistenceOps
    │  │  ├─ InstanceCatalog
    │  │  ├─ InstanceDraftFacade
    │  │  └─ InstanceResumeFacade
    │  │
    │  ├─ WorkflowGenerationService (生成服务)
    │  │  ├─ WorkflowGenerationRunner (LLM 生成)
    │  │  │  ├─ LlmClient (LLM 调用)
    │  │  │  ├─ QualityGateRunner (质量门)
    │  │  │  └─ WorkflowGeneration (标准化/解析)
    │  │  └─ WorkflowPreGenerationCoordinator (polish/clarify)
    │  │
    │  ├─ LlmClient (LLM 编排)
    │  │  ├─ OpenAiCompatibleLlm (HTTP LLM)
    │  │  ├─ AgentSpecializationRouter (模型选择)
    │  │  └─ StreamingSummary (流式总结)
    │  │
    │  ├─ WorkflowUiBridge (UI 桥接)
    │  │  ├─ WebviewPanel (Webview 管理)
    │  │  └─ WorkflowEngineMessaging (消息副作用)
    │  │
    │  ├─ WorkflowEngineInternals (内部工具)
    │  │  ├─ EngineDiagnosticsOps (诊断)
    │  │  ├─ EngineHostFactoryBuilder (宿主工厂)
    │  │  └─ EngineExecutionRunner (执行运行器)
    │  │
    │  └─ WorkflowEngineHostRegistry (宿主注册表)
    │     ├─ StageExecutionHost (阶段执行)
    │     │  ├─ StageCodeRunnerService (代码执行)
    │     │  ├─ StageLlmDelegate (LLM 文本)
    │     │  ├─ StagePathDelegate (路径操作)
    │     │  ├─ StageLintDelegate (Lint 检验)
    │     │  └─ StageMessagingDelegate (消息)
    │     │
    │     ├─ WorkflowEnginePathHost (路径宿主)
    │     ├─ HitlCoordinatorHost (HITL 动作)
    │     ├─ GenerationRunnerHost (生成执行)
    │     ├─ StartExecutionHost (执行开始)
    │     └─ ArtifactUiHost (工件 UI)
    │
    ├─ WorkflowPanelFactory (UI 面板工厂)
    │  └─ WorkflowPanel (单个工作流面板)
    │
    └─ StagentSidebarBootstrap (Sidebar 初始化)
       └─ StagentTaskListProvider (任务列表)
```

### 关键接口依赖

| 接口 | 定义位置 | 用途 |
|------|---------|------|
| `EngineHostFactoryDeps` | `engine-host/index.ts` | 四切片聚合（Messaging/Persistence/Generation/Execution） |
| `MessagingHostDeps` | `engine-host/MessagingHostDeps.ts` | postMessage、debugLog、**degraded**、metrics |
| `WorkflowEngineExecutionHost` | `execution-bindings/types.ts` | 执行窄接口（四 Host 组合） |
| `ExecuteNextStageLoopParams` | `execution-bindings/executor-loop-types.ts` | 执行循环切片入参 |
| `QualityGateHostInput` | `execution-bindings/types.ts` | 质量门运行时能力 |
| `guardedStageTransition` | `WorkflowStateTransitions.ts` | HITL/执行状态迁移 SSOT |
| `SandboxCapabilityState` | `sandbox/SandboxCapabilityMatrix.ts` | 沙箱 enforced / fail-closed |
| `StagentError` | `ErrorTypeUtils.ts` | 显式 errorType，分类不依赖 message |

---

## 🛡️ 主要风险点

### 1. **执行深度与递归风险**

**问题**：`getExecutionDepth()` 跟踪递归调用深度，防止过度递归

```typescript
// WorkflowEngine.ts
private executionDepth = 0;
// 每次 executeNextStage 前 +1，完成后 -1
```

**风险**：
- DAG 并行执行时，深度计算可能不准确
- 实现者需确保 depth++ 和 depth-- 配对

**缓解**：
- 明确的 executeNextStageLoop 生命周期
- 单元测试覆盖深度递增场景

---

### 2. **全局状态同步失败**

**问题**：WorkflowInstance 保存至 VS Code `globalState`，跨扩展中断时需恢复

```typescript
// InstancePersistenceOps.ts
void this.context.globalState.update(key, value)
  .catch(err => this.onGlobalStateFailed?.(instanceKey))
```

**风险**：
- 网络延迟或权限问题导致 globalState 更新失败
- UI 与磁盘状态不一致
- 恢复时可能读到过期的实例状态

**缓解**：
- `onGlobalStateFailed` 回调提示用户
- 定期触发 `persistMilestone()` 增量保存
- 恢复时校验 checksum 或版本号

---

### 3. **LLM 流截断处理**

**问题**：LLM 输出的 JSON 可能被截断，需检测并续接

```typescript
// LlmParseRetryLoop
if (isLikelyTruncatedJson(raw)) {
  // 构造续接 prompt，重新调用 LLM
  const continuePrompt = buildJsonContinuationPrompt(...)
  // 再调用一次 LLM，拼接结果
}
```

**风险**：
- 截断检测逻辑可能误报（识别不完整 JSON 的边界条件）
- 续接结果仍然不完整，形成死循环
- 每次续接都是一次额外的 LLM 调用，成本高

**缓解**：
- 限制续接重试次数（通常 3-5 次）
- 完善的 `extractJsonObject` 实现
- 监控续接 token 消耗

---

### 4. **质量门顺序与冲突**

**问题**：QualityGateRunner 按 phase 和 priority 执行，不同 gate 可能相互冲突

```typescript
// QualityGateRunner
// generate 阶段 8 个内置 gate id；pre-stage 7 个；post-stage 2 个；workflow-end 1 个（见 QualityGateIds.ts）
// 按 priority 排序；registry.validateDependencies() 启动期自检 dependsOn
// gate 之间没有显式的依赖或冲突处理
```

**风险**：
- Gate A 的修复可能破坏 Gate B 的前置条件
- Gate 执行顺序改变导致不同的输出
- 实现者需手工维护 priority 一致性

**缓解**：
- 建立 gate 依赖图（如在 PreGateRegistry）
- 单元测试覆盖常见冲突场景
- 文档说明各 gate 的非侵入式设计

---

### 5. **输入上下文预算溢出**

**问题**：StageInput 中每个 source 都可能包含大量上下文，需自动压缩

```typescript
// InputContextPolicy
// 总预算通常 100K tokens，需按优先级分配
const budgets = allocateContextBudget(sources, DEFAULT_CONTEXT_TOTAL_TOKEN_LIMIT)

// 如果单个 source 超过预算，自动降级至 'summary' 或 'reference'
const contextMode = source.contextMode ?? autoDegrade(tokens, budget)
```

**风险**：
- 自动降级可能丢失关键上下文，导致 LLM 输出质量下降
- 降级策略（摘要/引用）的实现质量难以控制
- 预算分配算法可能偏向某些 source，导致其他 source 被过度压缩

**缓解**：
- 对关键 source 设置 `required=true` 保护
- 提供显式的 `contextMode` 配置覆盖自动降级
- 监控压缩前后的 token 差异

---

### 6. **DAG 调度与状态一致性**

**问题**：支持 `dependsOn` DAG 并行执行，currentStageIndex 只是焦点，真实执行集合在 activeStageIds

```typescript
// WorkflowInstance
currentStageIndex: number  // UI 焦点（线性模式）
// DAG 真实执行集合 → deriveActiveStageIds(instance)
```

**风险**：
- 恢复时线性焦点与 DAG 活跃集合可能不一致
- 并行执行的多个 stage 可能因共享资源（文件、模型）产生竞态
- UI 显示的进度与实际执行顺序不一致

**缓解**：
- `syncInstanceStagePosition` 恢复后重新同步
- 并行 stage 间的输入依赖显式声明（via `stageId` 引用）
- 文件级锁（原子写入）防止并发冲突

---

### 7. **工件生命周期与回滚**

**问题**：阶段执行可能写入文件（file-write），失败时需回滚

```typescript
// ArtifactLifecycleManager
// M15.4：trackPersistedFileForInstance
artifactRegistry: Artifact[]  // 记录所有生成的文件路径

// 如果后续 gate 失败或用户 retry，需删除这些文件
// 或者保留，让用户手工清理
```

**风险**：
- 文件被意外覆盖（新的 stage 写同一路径）
- 回滚时无法恢复原文件内容（只能删除，不能还原）
- 长期运行积累大量临时文件

**缓解**：
- 工件注册表记录所有落盘文件路径
- 实现版本化存储（保留历史版本）
- 定期清理旧工件（基于 LRU 或时间戳）

---

### 8. **消息路由与顺序保证**

**问题**：WebviewPanel 接收异步 postMessage，需保证消息顺序

```typescript
// WorkflowUiBridge.postMessage
// 可能多个 stage 并行推送消息
// applyPostMessageSideEffects 处理副作用（如标记反馈）
// applyPostMessageDeliveryEffects 处理交付副作用
```

**风险**：
- 消息乱序导致 UI 状态混乱
- Webview 与扩展间的消息通道不可靠
- 网络延迟或浏览器刷新导致消息丢失

**缓解**：
- 消息携带 sequence 号或 timestamp
- Webview 端实现去重与排序逻辑
- 定期校验/同步状态（而不仅依赖增量消息）

---

### 9. **性能与 Token 成本**

**问题**：多次 LLM 调用（polish/clarify/generate/续接）导致成本高昂

**风险**：
- Polish 阶段的 LLM 调用可能浪费 token（改进效果不明显）
- 续接循环可能消耗 3-5x token
- DAG 并行时多个 stage 同时调用 LLM，配额可能不足

**缓解**：
- 缓存 polish 结果（`polishCache`）
- 限制续接重试次数
- 实现 token 使用量监控与告警
- 提供成本预估（before-generation 阶段）

---

### 10. **测试覆盖与回归**

**问题**：项目有 200+ 单元测试，但某些集成场景覆盖不足

**测试现状**：
- ✅ 单元测试：WorkflowGeneration、QualityGate、StageRunner 等
- ✅ 集成测试：workflow-engine-integration、workflow-hitl-coordinator-integration
- ⚠️ 端到端测试：有 mock 链实现（debug-e2e-mock-chain），但实际场景覆盖可能有限
- ⚠️ 性能测试：无明确的压力测试

**风险**：
- 新 gate 添加时可能与现有 gate 冲突（需要手工验证）
- DAG 并行场景的回归难以复现
- 大型项目（数千文件）的生成性能未知

**缓解**：
- 人工 E2E runbook：[`docs/e2e-runbooks/README.md`](docs/e2e-runbooks/README.md)
- Headless 基准：`npm run test:benchmark`（DAG 并行 speedup、千文件 context 扫描）
- SPEC-v2 文档维护 与实现一致性检查

---

## 📊 项目统计

| 指标 | 数值 |
|------|------|
| **源文件** | ~686 个 `.ts`（不含 test） |
| **测试文件** | ~255 个 `.test.ts`；单元 ~1200+ case |
| **集成测试** | 12（文件名含 `integration`） |
| **核心模块** | WorkflowEngine 薄门面 + `createWorkflowEngineParts` 装配 |
| **Backend/Frontend 消息** | 24 / 16（schema 校验） |
| **工具类型** | 类型 5 种；可执行 4 种（`user-prompt` 未实现） |
| **内置 QualityGate ID** | 18（`QualityGateIds.ts`） |
| **错误类型** | 17+（含 sandbox-*、confidence-too-low） |
| **持久化文件** | `.wf-state.json`（非 instance.json） |
| **防抖保存** | 200ms |
| **最小 VS Code** | 1.85.0 |
| **扩展版本** | 0.7.0 |

---

## 🎓 关键设计模式

### 1. **Facade 模式**
- WorkflowEngine 通过 5 个门面（instance/generation/execution/hitl/artifacts）暴露 API
- 隐藏内部复杂性，提供清晰的接口

### 2. **Dependency Injection（DI）+ ISP**
- `EngineHostFactoryDeps` 四切片；runner 只依赖角色子接口
- `createWorkflowEngineParts` 为 composition root；`WorkflowEngineHostRegistry` 缓存宿主

### 3. **Strategy 模式**
- ErrorHandling 的 strategy 字段（retry/fail/pause/skip）
- InputSource 的 mergeStrategy（concat/template/object）

### 4. **Visitor 模式**
- QualityGateRunner 遍历并执行 gate（可扩展）
- PreGateRegistry 注册与执行前置 gate

### 5. **State Machine（guarded SSOT）**
- `WorkflowStateTransitions.guardedStageTransition` / `guardedInstanceTransition`
- 非法边抛错 + `setTransitionLogger` 可观测

### 6. **Registry 模式**
- WorkflowEngineHostRegistry 注册并返回各类 host
- PreGateRegistry、QualityGate 默认注册表

---

## 🔍 已落地成熟度机制（2026）

| 机制 | 实现 |
|------|------|
| 可观测性 | `traceId` 贯穿 debug/session/metrics/failure；`degraded()` 替代静默 warn |
| 架构守卫 | `architecture-no-core-vscode`、`architecture-interface-ceiling`、`engine-headless-construct` |
| HITL SSOT | `WorkflowStateTransitions` guarded 迁移 |
| 沙箱契约 | `SandboxCapabilityMatrix` + fail-closed；`sandbox.verificationOnly` |
| 类型化错误 | `StagentError.errorType` |
| VS Code 解耦 | `src/adapters/` 边缘适配 |
| 双轨置信 | `verificationConfidence`（轨道 A）+ `ConfidenceScorer`（轨道 B） |
| Charter | `buildCharterConstraintsBlock` 注入 + `charter-constraint-warn` |
| 决策前置 / AFK | `decision-frontload/*`、`afk/evaluateAfkAcceptance.ts` |

## 🔍 后续改进方向

1. **DAG 一等公民**：并行 wave UI 与恢复语义进一步对齐
2. **工件版本管理**：完整 diff / 回滚 UX
3. **多模型直连**：除 VS Code LM API 外的提供商集成
4. **端到端测试**：真实 LLM 场景覆盖

---

## 📝 总结

Stagent 是一个**高度模块化、设计精良**的 AI 工作流编排引擎，具有：

- ✅ **清晰的数据流**：从需求 → 生成 → 执行 → HITL → 完成
- ✅ **完善的测试**：~1200+ 单元 case + 12 集成 + 架构守卫测试
- ✅ **灵活的扩展点**：质量门、宿主依赖注入、自定义工具类型
- ✅ **深思熟虑的错误处理**：多层质量门、结构修复、HITL 协调

**主要风险**仍须关注：
1. DAG 并行与 executionDepth 配对
2. globalState 与磁盘双写一致性
3. LLM 流截断续接成本
4. 非 darwin 平台沙箱 fail-closed 对用户的可用性影响

可观测性与 fail-visible 机制已显著加强（traceId、degraded、guarded 迁移）；后续重点在 E2E 与性能基准。
