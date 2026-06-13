# Stagent 架构 - 数据流与模块依赖可视化

> 装配与分层见 `engine-wiring/createWorkflowEngineParts.ts` 与 `docs/ENGINE_LAYERS.md`（含 Charter/双轨/AFK 横切域）。Gate ID 以 `src/QualityGateIds.ts` 为准。最后更新：2026-06。

## 1️⃣ 完整数据流图

```
┌─────────────────────────────────────────────────────────────────────┐
│                         VS Code UI Layer                             │
├──────────────────────────────────────────────────────────────────────┤
│  Sidebar (taskList)          Webview Panels                          │
│  ├─ 新建任务按钮     ╔════════════════════════════════════════╗    │
│  ├─ 任务列表         ║ 1. InputGeneration UI (输入面板)        ║    │
│  └─ AI 控制          ║    ├─ 任务类型选择                      ║    │
│                      ║    └─ 需求描述输入                      ║    │
│                      ╠════════════════════════════════════════╣    │
│                      ║ 2. ConfirmPlan UI (确认面板)            ║    │
│                      ║    ├─ 工作流 DAG 可视化                 ║    │
│                      ║    └─ Approve/Cancel 按钮              ║    │
│                      ╠════════════════════════════════════════╣    │
│                      ║ 3. StageProgress UI (执行进度)          ║    │
│                      ║    ├─ 当前阶段输出                      ║    │
│                      ║    └─ Pause/Skip 按钮                  ║    │
│                      ╠════════════════════════════════════════╣    │
│                      ║ 4. HITL Panel (人工审核)                ║    │
│                      ║    ├─ Approve/Retry                    ║    │
│                      ║    ├─ Answer Questions                 ║    │
│                      ║    └─ Decision Review                  ║    │
│                      ╚════════════════════════════════════════╝    │
└─────────────────────────────────────────────────────────────────────┘
         ↓ postMessage ↑ command / message handlers
┌─────────────────────────────────────────────────────────────────────┐
│                    WorkflowEngine (中央编排器)                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ 5 个门面 Facades (暴露 API)                                  │   │
│  ├─ instances ──→ WorkflowInstanceManager (实例管理)            │   │
│  ├─ generation ──→ WorkflowGenerationService (生成服务)        │   │
│  ├─ execution ──→ WorkflowEngineExecutionHost (执行宿主)       │   │
│  ├─ hitl ──→ WorkflowHitlCoordinator (HITL 动作)              │   │
│  └─ artifacts ──→ WorkflowArtifactUi (工件 UI)                │   │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ 内部组件                                                      │   │
│  ├─ LlmClient (LLM 调用编排)                                    │   │
│  ├─ WorkflowUiBridge (UI 桥接)                                  │   │
│  ├─ engine-wiring/createWorkflowEngineParts (装配根)            │   │
│  ├─ WorkflowEngineInternals (诊断 + 工厂构建)                   │   │
│  │  ├─ EngineDiagnosticsOps                                    │   │
│  │  └─ EngineHostFactoryBuilder                                │   │
│  ├─ WorkflowEngineHostRegistry (缓存宿主注册表)               │   │
│  ├─ WorkflowEngineDiagnostics (warn/degraded/debug/metrics)   │   │
│  └─ adapters/ (VS Code 边缘适配：设置、toast、取消检测)        │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
      ↓ generate() / startExecution()
┌─────────────────────────────────────────────────────────────────────┐
│                  生成流程 (Generation Pipeline)                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌────────────────┐        │
│  │  Polish      │───→│  Clarify     │───→│  LLM Generate  │        │
│  │  (优化需求)   │    │  (问题澄清)    │    │  (工作流生成)   │        │
│  └──────────────┘    └──────────────┘    └────────────────┘        │
│                                                  ↓                   │
│                                           ┌─────────────────┐       │
│                                           │ 流式接收 + parse│       │
│                                           │ JSON 结果      │       │
│                                           └────────┬────────┘       │
│                                                    ↓                 │
│  ┌───────────────┐    ┌─────────────┐   ┌──────────────────┐      │
│  │ 标准化         │    │ 结构修复     │   │ 质量门检验        │      │
│  │(normalizeWf)  │◄──│(repair)     │◄──│ (QualityGates)  │      │
│  └────────┬──────┘    └─────────────┘   └──────────────────┘      │
│           ↓                                                          │
│  ┌───────────────────────────────────────────────────────────┐     │
│  │            WorkflowDefinition 创建完成                     │     │
│  │  {version, id, meta, stages[]}                           │     │
│  │  质量门: DecisionContent, ConfigContract, Rule20,        │     │
│  │        plan-completeness, rule20-violations, … (18 gate ids)│     │
│  └────────────────────┬──────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────┘
           ↓ 用户确认 (Approve Decision)
┌─────────────────────────────────────────────────────────────────────┐
│                  执行流程 (Execution Loop)                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ While !allStagesCompleted() {                              │    │
│  │                                                            │    │
│  │  // 1. 阶段前检验                                         │    │
│  │  Stage stage = stages[currentStageIndex]                 │    │
│  │  ├─ 质量门前检验 (pre-stage gates)                       │    │
│  │  │  ├─ SdkPathContractLint                              │    │
│  │  │  ├─ WorkspaceLint                                   │    │
│  │  │  └─ RedGreenGate                                    │    │
│  │  │                                                       │    │
│  │  │ // 2. 输入解析                                       │    │
│  │  ├─ resolveInput(stage)                                │    │
│  │  │  ├─ 遍历 input.sources                              │    │
│  │  │  │  ├─ stage-output: 读前置 stage 输出              │    │
│  │  │  │  ├─ user-input: 读用户初始输入                  │    │
│  │  │  │  ├─ file: 读文件内容                            │    │
│  │  │  │  └─ constant: 常量                              │    │
│  │  │  ├─ 上下文压缩 (InputContextPolicy)                │    │
│  │  │  │  └─ 按 token 预算自动降级至 summary/reference │    │
│  │  │  └─ 按 mergeStrategy 合并 (concat/template/object) │    │
│  │  │                                                       │    │
│  │  │ // 3. 工具执行 (via StageExecutionHost)            │    │
│  │  ├─ tool.type 判断                                     │    │
│  │  │                                                       │    │
│  │  ├─ if 'llm-text':                                     │    │
│  │  │  ├─ StageLlmDelegate.executeLlmText()              │    │
│  │  │  ├─ augmentSystemPrompt: DecisionRecord + Charter │    │
│  │  │  ├─ LlmClient.invokeLlmStreaming()                │    │
│  │  │  ├─ 流式推送 UI                                   │    │
│  │  │  ├─ 质量评分 (OutputQualityScorer → ConfidenceScorer)│   │
│  │  │  └─ stageRuntime.outputs[primaryKey] = result     │    │
│  │  │                                                       │    │
│  │  ├─ elif 'code-runner':                               │    │
│  │  │  ├─ StageCodeRunnerService.executeCodeRunner()    │    │
│  │  │  ├─ 工作目录解析 (pathBase)                        │    │
│  │  │  ├─ 命令验证 (CodeRunnerCommandLint)              │    │
│  │  │  ├─ SandboxExecutor.run()                         │    │
│  │  │  ├─ 捕获 {exitCode, stdout, stderr}              │    │
│  │  │  ├─ test_run/smoke exit 0 → verificationConfidence│   │
│  │  │  └─ 结果写入 stageRuntime                         │    │
│  │  │                                                       │    │
│  │  ├─ elif 'file-write':                                │    │
│  │  │  ├─ non-llm-runners/file-write.ts               │    │
│  │  │  ├─ 从 sourceStageId 读 sourceOutputKey           │    │
│  │  │  ├─ 原子写入文件                                   │    │
│  │  │  └─ ArtifactLifecycleManager.track()              │    │
│  │  │                                                       │    │
│  │  ├─ elif 'file-read':                                 │    │
│  │  │  └─ 读取文件内容到 stageRuntime.outputs          │    │
│  │  │                                                       │    │
│  │  └─ （user-prompt 类型存在但执行器未实现；人工介入走 HITL/question）│
│  │                                                         │    │
│  │  // 4. 质量门后检验                                   │    │
│  │  ├─ runPostStageQualityGates()                        │    │
│  │  │  ├─ charter-constraint-warn（impl 后 Charter 命中） │    │
│  │  │  ├─ post-impl-static-analysis                     │    │
│  │  │  └─ run-end-contract-lint（workflow-end）          │    │
│  │  │                                                       │    │
│  │  │ // 5. HITL 协调（WorkflowStateTransitions SSOT）  │    │
│  │  ├─ if pauseAfter || hasQuestions {                  │    │
│  │  │  ├─ guardedStageTransition(rt, 'paused'|...)      │    │
│  │  │  ├─ postMessage(UI, stageStatusUpdate/questions)  │    │
│  │  │  └─ 等待用户: approve/retry/answerQuestions       │    │
│  │  │                                                       │    │
│  │  │ // 6. 错误处理                                     │    │
│  │  ├─ if error {                                        │    │
│  │  │  ├─ switch(onError.strategy) {                    │    │
│  │  │  │  ├─ 'retry': retryCount++ → goto 1             │    │
│  │  │  │  ├─ 'fail': 工作流状态 = failed, break        │    │
│  │  │  │  ├─ 'pause': 暂停等待人工审查                  │    │
│  │  │  │  └─ 'skip': 跳过本阶段                         │    │
│  │  │  └─ }                                              │    │
│  │  │                                                       │    │
│  │  │ // 7. 状态更新与保存                               │    │
│  │  ├─ stageRuntime.status = 'done'                      │    │
│  │  ├─ stageRuntime.completedAt = now()                │    │
│  │  ├─ scheduleSave() (增量保存)                        │    │
│  │  ├─ persistMilestone() (定期检查点)                 │    │
│  │  └─ postMessage(UI, stateUpdate)                     │    │
│  │                                                       │    │
│  │  // 8. 递进游标                                       │    │
│  │  currentStageIndex++                                  │    │
│  │                                                       │    │
│  │ } // end while                                        │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
           ↓ 所有阶段完成
┌─────────────────────────────────────────────────────────────────────┐
│                     工作流完成 (Completion)                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ├─ 质量门结束检验 (workflow-end gates)                             │
│  ├─ 生成工作流摘要 (WorkflowPlanSummary)                            │
│  ├─ 工作流状态 = 'completed'                                       │
│  ├─ 清理临时资源                                                    │
│  └─ 显示最终结果面板                                                │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2️⃣ 模块依赖图（仅显示关键依赖）

```
extension.ts (激活入口)
    │
    ├─→ WorkflowEngine (核心编排器)
    │    │
    │    ├─→ WorkflowInstanceManager
    │    │    ├─→ InstanceLifecycle
    │    │    ├─→ InstancePersistenceOps
    │    │    │    └─→ (vs code.globalState)
    │    │    ├─→ InstanceCatalog
    │    │    ├─→ InstanceDraftFacade
    │    │    └─→ InstanceResumeFacade
    │    │
    │    ├─→ WorkflowGenerationService
    │    │    ├─→ WorkflowGenerationRunner
    │    │    │    ├─→ LlmClient
    │    │    │    │    ├─→ OpenAiCompatibleLlm
    │    │    │    │    ├─→ AgentSpecializationRouter
    │    │    │    │    └─→ StreamingSummary
    │    │    │    ├─→ QualityGateRunner
    │    │    │    │    └─→ QualityGate (18 内置 gate id)
    │    │    │    └─→ WorkflowGeneration
    │    │    │         ├─→ extractJsonObject
    │    │    │         ├─→ normalizeWorkflow
    │    │    │         └─→ structuralRepair
    │    │    └─→ WorkflowPreGenerationCoordinator
    │    │         ├─→ handlePolishUserTask
    │    │         └─→ handleGenerateClarifyQuestions
    │    │
    │    ├─→ LlmClient (直接引用，含缓存)
    │    │
    │    ├─→ WorkflowUiBridge
    │    │    ├─→ WebviewPanel
    │    │    └─→ WorkflowEngineMessaging
    │    │
    │    ├─→ engine-wiring/createWorkflowEngineParts
    │    │    ├─→ LateBound<WorkflowEngineInternals>（延迟绑定）
    │    │    └─→ executeNextStageRef（唯一循环缝）
    │    │
    │    ├─→ WorkflowEngineInternals
    │    │    ├─→ EngineDiagnosticsOps
    │    │    └─→ EngineHostFactoryBuilder
    │    │
    │    └─→ WorkflowEngineHostRegistry（缓存 path/stage/hitl/start hosts）
    │         ├─→ StageExecutionHost
    │         │    ├─→ StageCodeRunnerService
    │         │    │    ├─→ SandboxExecutor
    │         │    │    └─→ CodeRunnerCommandLint
    │         │    ├─→ StageLlmDelegate
    │         │    ├─→ StagePathDelegate
    │         │    ├─→ StageLintDelegate
    │         │    │    └─→ WorkflowEngineWorkspaceLint
    │         │    └─→ StageMessagingDelegate
    │         ├─→ WorkflowEnginePathHost
    │         ├─→ HitlCoordinatorHost
    │         ├─→ GenerationRunnerHost
    │         ├─→ StartExecutionHost
    │         └─→ ArtifactUiHost
    │
    ├─→ WorkflowPanelFactory
    │    └─→ WorkflowPanel
    │
    └─→ StagentSidebarBootstrap
         └─→ StagentTaskListProvider
```

---

## 3️⃣ 宿主依赖注入树（ISP 四切片）

```
EngineHostFactoryDeps = MessagingHostDeps + PersistenceHostDeps + GenerationHostDeps + ExecutionHostDeps + { context, maxStageWarn, getGenerationSeq }

MessagingHostDeps
├─ postMessage / postGenerationProgress / bindPanel
├─ warn / error / degraded / debugLog / logUserAction / flushMetrics?

PersistenceHostDeps
├─ getInstance / setInstance / getCurrentInstanceKey / setCurrentInstanceKey
├─ scheduleSave / persistMilestone / persistInstanceSnapshot
├─ resolveOutputPath / ensureTaskDir / loadInstanceByKey / ...

GenerationHostDeps
├─ invokeLlmRaw / parseWorkflowJson / normalizeWorkflow
├─ ensurePreExecDraftShell / polishCacheKey / isGenerationSuperseded

ExecutionHostDeps
├─ executeNextStage / getExecutionDepth / rejectApproveDecision
├─ markStageArtifactsApproved / resolveReuseInstance

WorkflowEngineHostRegistry（缓存，非每次 thunk 重建）
├─ pathHost()
├─ stageExecutionHost()  → WorkflowEngineExecutionHost
├─ hitlHost()            → HitlCoordinatorHost
├─ startExecutionHost()
└─ artifactUiHost()
```

各 runner 仅 import 其角色子类型：`PreGenerationHostDeps`、`HitlHostDeps`、`StartExecutionHostDeps` 等。

---

## 4️⃣ 质量门检验顺序（按 phase）

单点定义：[`src/QualityGateIds.ts`](src/QualityGateIds.ts) · `BUILTIN_QUALITY_GATE_IDS`（**18** 个 id）。注册：[`BuiltinQualityGates.ts`](src/BuiltinQualityGates.ts) → [`quality-gates/generateGates.ts`](src/quality-gates/generateGates.ts) / [`preStageGates.ts`](src/quality-gates/preStageGates.ts) / [`postStageGates.ts`](src/quality-gates/postStageGates.ts)。

> 下列 **Lint 策略**（如 `DecisionContentLintPolicy`、`ConfigContractLint`、`SdkPathContractLint`）在 generate/执行链内被 gate **调用**，但**不是** `QualityGateRegistry` 的 gate id。

### generate 阶段（`BUILTIN_GENERATE_GATES`）

| Gate ID | 严重度 | 说明 |
|---------|--------|------|
| [`schema-validation`](src/QualityGateIds.ts#L6) | block | WorkflowDefinition 字段 / schema |
| [`rule20-violations`](src/QualityGateIds.ts#L7) | block | Rule20 结构违规 |
| [`plan-completeness`](src/QualityGateIds.ts#L8) | block | 计划完整性（测试基础设施、自愈链等） |
| [`generator-meta-warnings`](src/QualityGateIds.ts#L9) | warn | 生成元数据告警 |
| [`dependency-graph-warnings`](src/QualityGateIds.ts#L10) | warn | 依赖图告警 |
| [`complexity-warnings`](src/QualityGateIds.ts#L11) | warn | 复杂度告警 |
| [`prototype-data-contract`](src/QualityGateIds.ts#L12) | warn | prototype 数据契约 |
| [`static-analysis-on-generate`](src/QualityGateIds.ts#L13) | warn | 生成期静态分析（可选） |

### pre-stage 阶段（`BUILTIN_PRE_STAGE_GATES`）

| Gate ID | 严重度 | when / 触发 |
|---------|--------|-------------|
| [`debug-feedback-loop`](src/QualityGateIds.ts#L16) | block/warn | debug taskType |
| [`red-green-pre-impl`](src/QualityGateIds.ts#L17) | block/warn | impl 前配对 test（`stagent.tdd.redGreenGate`） |
| [`test-run-deps-install`](src/QualityGateIds.ts#L18) | block | test_run 前自动 npm install |
| [`test-run-preflight`](src/QualityGateIds.ts#L19) | block | test_run 前磁盘/命令 preflight |
| [`sdk-path-contract-hard`](src/QualityGateIds.ts#L20) | block | SDK 路径契约 hard |
| [`test-run-contract-lint`](src/QualityGateIds.ts#L21) | warn | test_run 前跨文件契约 lint |
| [`requirements-txt-preflight`](src/QualityGateIds.ts#L22) | block/auto-fix | pip install -r 前 requirements.txt 校验 |

### post-stage 阶段（`BUILTIN_POST_STAGE_GATES`）

| Gate ID | 严重度 | 触发 |
|---------|--------|------|
| [`charter-constraint-warn`](src/QualityGateIds.ts#L23) | warn | impl 后 Charter avoid/constraint 关键词命中 |
| [`post-impl-static-analysis`](src/QualityGateIds.ts#L26) | warn | impl 后静态分析（可选） |

### workflow-end 阶段（`BUILTIN_WORKFLOW_END_GATES`）

| Gate ID | 严重度 | 说明 |
|---------|--------|------|
| [`run-end-contract-lint`](src/QualityGateIds.ts#L27) | warn | 工作流结束跨文件契约复查 |

### 非 Registry、但与轨道 A 并列的硬校验

| 机制 | 时机 |
|------|------|
| `CodeRunnerCommandLint` | 生成期 + 执行前 |
| `RedGreenGate`（规划期 horizontal-tdd warning） | 生成后 |
| `ApproveDecisionGate` | 决策 stage 结束 |
| `injectSelfHealStages` / `disk-bootstrap` | 生成归一化 |
| `verificationFlaky` + `deterministicVerification` | test_run 执行 |
| `evaluateAfkAcceptance` | workflow 结束（AFK 模式） |
| `OutputQualityScorer` / `ConfidenceScorer` | llm-text stage 后（非 QualityGate，写入 `_confidence`） |

---

## 5️⃣ 错误处理流程图

```
执行阶段 → 错误发生
   │
   ├─ classifyThrownError：优先 StagentError.errorType（implHollowOutput / llmContextOverflow 等）
   ├─ buildStageErrorPayload → stageError（含 traceId，由 WorkflowUiBridge 富化）
   ├─ StageRuntimeLastError 记录
   │  ├─ error: 错误信息
   │  ├─ errorType: 15+ 种错误类型
   │  │  ├─ llm-timeout
   │  │  ├─ llm-context-overflow
   │  │  ├─ code-runner-timeout
   │  │  ├─ file-not-found
   │  │  ├─ llm-quality-below-threshold
   │  │  └─ ... (12 种更多)
   │  ├─ stdout / stderr （如有）
   │  └─ startedAt / completedAt
   │
   ├─ 查询 stage.onError.strategy
   │  │
   │  ├─ 'retry':
   │  │  ├─ retryCount++
   │  │  ├─ if retryCount > maxRetries:
   │  │  │  ├─ if escalateAfterRetries:
   │  │  │  │  └─ strategy 转为 'pause'
   │  │  │  └─ else: strategy 转为 'fail'
   │  │  └─ else: 重新执行本阶段
   │  │
   │  ├─ 'fail':
   │  │  ├─ status = 'error'
   │  │  ├─ workflow.status = 'failed'
   │  │  ├─ postMessage(UI, error)
   │  │  └─ 中止工作流
   │  │
   │  ├─ 'pause':
   │  │  ├─ status = 'paused'
   │  │  ├─ postMessage(UI, pause + error reason)
   │  │  └─ 等待人工审查 (approve/retry/answer)
   │  │
   │  └─ 'skip':
   │     ├─ status = 'skipped'
   │     ├─ 跳过本阶段
   │     └─ 继续下一阶段
   │
   ├─ 持久化错误信息
   │  └─ stageRuntime.lastError = {...}
   │
   ├─ 推送 UI + 失败日志
   │  ├─ postMessage(UI, { type: 'stageError', traceId, ... })
   │  └─ appendWorkflowFailureJsonl / appendGlobalFailureJsonl
   └─ guardedInstanceTransition(instance, 'failed', ...)（工作流级失败时）
```

---

## 6️⃣ HITL 协调流程图

```
工作流执行中 → pauseAfter 阶段完成
   │
   ├─ guardedStageTransition(rt, 'paused', reason)   // WorkflowStateTransitions SSOT
   ├─ postMessage(UI, { type: 'stageStatusUpdate', status: 'paused' })
   │
   └─ 等待用户输入（engine.hitl / panel-handlers）
      │
      ├─ approve (handleApprove)
      │  ├─ markStageArtifactsApproved(stageId)
      │  ├─ status = 'done'
      │  ├─ currentStageIndex++
      │  └─ 继续执行下一阶段
      │
      ├─ retry (handleRetry)
      │  ├─ 清空本阶段 outputs
      │  ├─ retryCount++
      │  ├─ retryComment = 用户注释（可选）
      │  ├─ status = 'pending'
      │  └─ 重新执行本阶段
      │
      ├─ answerQuestions / answerQuestionsBefore
      │  ├─ questionBeforeAnswers = {...}
      │  ├─ status = 'pending'
      │  └─ 重新执行本阶段（带问卷答案上下文）
      │
      └─ answerQuestionsAfter
         ├─ questionAnswers = {...}
         ├─ status = 'done'
         └─ 继续下一阶段
```

---

## 7️⃣ 实例持久化与可观测性

### 持久化

```
WorkflowInstance 存储
│
├─ 1️⃣ 磁盘（权威）
│  ├─ 路径：<workspace>/.stagent/instances/<key>/.wf-state.json
│  ├─ scheduleSave() 防抖 200ms（INSTANCE_PERSIST_DEBOUNCE_MS）
│  └─ 失败 → degraded('state_file_persist_failed')
│
├─ 2️⃣ globalState（索引/快速恢复）
│  ├─ 键：globalStateKeyForInstance(key)
│  └─ 失败 → onGlobalStateFailed + actionHint
│
└─ 3️⃣ 内存 WorkflowInstanceManager.instance
```

### 可观测性（traceId 关联）

| 日志 | 文件 / purpose | 事件示例 |
|------|----------------|----------|
| per-task | `<taskDir>/.wf-debug.log` | stage_start, dag_scheduler_exit, degraded |
| session | `<globalStorage>/.session-debug.log` | llm_start, diagnostics/degraded, metrics/summary |
| failures | `.wf-failures.jsonl` + `failure-logs/failures.jsonl` | stageError 结构化记录 |

`instance.traceId` 从 pre-exec draft shell 创建，run start 复用，贯穿 BackendMessage / metrics / failure JSONL。

---

## 8️⃣ 输入上下文预算分配

```
总预算：DEFAULT_CONTEXT_TOTAL_TOKEN_LIMIT (通常 100K tokens)
│
├─ 系统 prompt：20% (~20K)
├─ 阶段定义：5% (~5K)
├─ 输入上下文：75% (~75K)
│  │
│  └─ allocateContextBudget(sources)
│     ├─ 按优先级排序 sources
│     │  ├─ 高优先级（required=true）：保留 80%
│     │  └─ 低优先级（required=false）：共享 20%
│     │
│     └─ 对每个 source 估计 token 数
│        ├─ if tokens <= allocated: 保留全部
│        ├─ elif tokens > allocated && contextMode=full:
│        │  └─ 自动降级至 'summary' 或 'reference'
│        └─ 生成 InputSource.contextMode
```

---

## 9️⃣ DAG 并行执行示意

```
线性模式（默认）                  DAG 模式（启用 enableDagScheduler）
│                                  │
├─ Stage A                         ├─ Stage A (dep: [])
│  status = done                   │  status = done
│  currentStageIndex = 0           │
│                                  ├─ ┌─ Stage B (dep: [A])
├─ Stage B                         │  │  status = running
│  status = running                │  │
│  currentStageIndex = 1           │  └─ Stage D (dep: [A])
│                                  │     status = running
├─ Stage C                         │     (并行！)
│  status = pending                │
│  currentStageIndex = 2           ├─ Stage C (dep: [B, D])
│                                  │  status = waiting (等待 B/D 完成)
└─ Stage D                         │
   status = pending                └─ ...
```

currentStageIndex：线性模式下的权威游标，DAG 模式下是 UI 焦点缓存

---

## 🔟 扩展点（Plugin Interface）

```
QualityGate Registry
├─ 定义 id：QualityGateIds.ts → quality-gates/*.ts
├─ 注册：registerQualityGate(gate) 或并入 BuiltinQualityGates
└─ 执行：QualityGateRunner / runPreGateRegistry 按 phase+priority 调用 evaluate

ToolConfig 扩展
├─ 添加新工具类型：ToolType union
├─ 实现 stage runner：WorkflowEngineExecutionHost
└─ 注册到 executeStage() 的 switch 分支

Host Dependency
├─ 实现自定义 HostDeps 子接口
├─ 注入到 EngineHostFactoryDeps
└─ 通过 WorkflowEngineHostRegistry 消费

消息类型扩展
├─ 添加 BackendMessage union 成员
├─ Webview 侧处理消息类型
└─ 通过 postMessage() 推送
```
