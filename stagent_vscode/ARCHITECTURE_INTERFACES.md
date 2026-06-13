# Stagent 架构 - 关键接口与通信协议

> 类型与消息以 `src/workflow-types/` 与 `src/engine-host/` 源码为准；消息 schema 由 `npm run check:message-schema` 校验。  
> 层职责与横切域见 `docs/ENGINE_LAYERS.md`。Gate ID 见 `src/QualityGateIds.ts`。最后更新：2026-06。

## 1️⃣ 核心类型契约

### WorkflowDefinition（工作流定义）

```typescript
interface WorkflowDefinition {
  version: '2.0';                    // 版本号
  id: string;                        // 唯一标识（wf_XXXXXXXX）
  meta: WorkflowMeta;                // 元数据
  stages: Stage[];                   // 阶段列表
  globalConfig?: {
    enableDagScheduler?: boolean;    // 启用 DAG 并行
    maxStages?: number;              // 最大阶段数
  };
}

interface WorkflowMeta {
  title: string;                     // 工作流标题
  taskType: string;                  // 任务类型（refactor/test/debug/etc）
  userInput: string;                 // 用户原始需求
  createdAt: string;                 // ISO 8601 时间戳
  isGreenfield?: boolean;            // 新项目/现有项目标志
  taskWorkspacePath?: string;        // 任务工作文件夹路径
  engineAutoInsertedGlobalArchitectureStageId?: string;  // 自动插入的决策 stage
}

interface Stage {
  id: string;                        // 唯一标识（stage_impl_*, stage_test_*, etc）
  title: string;                     // 阶段标题
  description?: string;              // 描述
  tool: 'llm-text' | 'code-runner' | 'file-write' | 'file-read' | 'user-prompt'; // user-prompt：schema 有，执行器未实现
  toolConfig: ToolConfig;            // 工具配置（union）
  input: StageInput;                 // 输入源与合并策略
  outputs: StageOutput[];            // 输出声明
  pauseAfter: boolean;               // 执行后是否暂停（HITL）
  isDecisionStage?: boolean;         // 是否决策阶段
  exposeAssumptions?: boolean;       // 暴露假设
  questionBefore?: Question[];       // 工具执行前追问
  questionAfter?: Question[];        // 工具执行后追问
  skipIf?: SkipCondition;           // 跳过条件
  onError?: ErrorHandling;           // 错误处理策略
  dependsOn?: string[];              // DAG 依赖（前置 stage id 列表）
}

interface ToolConfig {
  type: ToolType;
  // 根据 type 有不同的字段
  // LlmTextConfig: {systemPrompt, temperature?, maxTokens?, writeOutputToFile?, writePathBase?}
  // CodeRunnerConfig: {command, workingDir?, pathBase?, timeout?, captureOutput, serve?, readyProbe?, graceMs?, readyTimeoutMs?}
  // FileWriteConfig: {filePath, sourceOutputKey, sourceStageId?, pathBase?}
  // FileReadConfig: {filePath}
  // UserPromptConfig: {promptText, inputLabel}
}

interface StageInput {
  sources: InputSource[];            // 输入源列表
  mergeStrategy: 'concat' | 'template' | 'object';  // 合并策略
  mergeTemplate?: string;            // template 策略的模板字符串
}

interface InputSource {
  type: 'stage-output' | 'user-input' | 'human-answer' | 'human-answer-before' | 'constant' | 'file';
  stageId?: string;                  // 源 stage id
  outputKey?: string;                // 源输出 key
  questionId?: string;               // 源问题 id（human-answer）
  filePath?: string;                 // 文件路径（file 类型）
  value?: string;                    // 常量值（constant 类型）
  pathBase?: 'instance' | 'workspace'; // 路径根目录（默认 instance）
  contextMode?: 'full' | 'summary' | 'reference';  // 上下文压缩模式
  required?: boolean;                // 是否必需（默认 true）
}

interface StageOutput {
  key: string;                       // 输出 key（唯一，在 stage 内）
  format: 'text' | 'markdown' | 'json' | 'file-path';  // 格式
  description?: string;              // 描述
}

interface ErrorHandling {
  strategy: 'retry' | 'fail' | 'pause' | 'skip';
  maxRetries?: number;               // retry 策略时有效（默认 3）
  escalateAfterRetries?: boolean;    // 超限后转为 pause（默认 true）
}
```

### WorkflowInstance（工作流实例）

```typescript
interface WorkflowInstance {
  traceId?: string;                  // 追踪 id（用于日志关联）
  definition: WorkflowDefinition;    // 工作流定义
  currentStageIndex: number;         // 当前阶段下标（线性模式权威，DAG 模式为焦点）
  stageRuntimes: StageRuntime[];     // 各阶段运行时状态
  status: 'idle' | 'running' | 'paused' | 'completed' | 'failed';
  taskDir?: string;                  // 任务目录路径（绝对路径）
  startedAt?: string;                // 开始时间（ISO 8601）
  completedAt?: string;              // 完成时间（ISO 8601）
  artifactRegistry?: Artifact[];     // 生成文件追踪（用于回滚）
}

interface StageRuntime {
  stageId: string;
  status: 'pending' | 'running' | 'waiting-questions' | 'paused' | 'done' | 'skipped' | 'error' | 'retrying';
  outputs: Record<string, unknown>;  // 输出结果（key → value）
  retryCount: number;                // 重试次数
  retryComment?: string;             // 重试注释
  questionBeforeAnswers?: Record<string, string>;  // 执行前问卷答案
  questionAnswers?: Record<string, string>;        // 执行后问卷答案
  approvedDecisionRecord?: string;   // 审核决策记录（YAML/JSON）
  startedAt?: string;                // 开始时间
  completedAt?: string;              // 完成时间
  lastError?: StageRuntimeLastError; // 最近一次错误（用于恢复重放）
  grillRound?: number;               // 自适应 grill 轮次（M23-F1）
  redGreenSlice?: {                  // 红绿门状态（M22-F2）
    semantic: string;
    phase: 'awaiting-red' | 'red-confirmed' | 'blocked-green';
  };
}

interface StageRuntimeLastError {
  error: string;                     // 错误信息
  errorType: ErrorType;              // 错误类型
  stdout?: string;                   // 标准输出（code-runner）
  stderr?: string;                   // 标准错误输出（code-runner）
}

type ErrorType =
  | 'llm-timeout'                    // LLM 调用超时
  | 'llm-context-overflow'           // 上下文溢出
  | 'llm-invalid-output'             // 输出格式无效
  | 'llm-refusal'                    // LLM 拒绝执行
  | 'llm-quality-below-threshold'    // 输出质量过低
  | 'tool-execution-failed'          // 工具执行失败
  | 'code-runner-timeout'            // 代码执行超时
  | 'file-not-found'                 // 文件不存在
  | 'stage-not-found'                // 阶段不存在
  | 'invariant-violation'            // 不变量违反
  | 'retry-limit-exceeded'           // 重试限制超出
  | 'sandbox-network-blocked'        // 沙箱网络被阻止
  | 'sandbox-memory-exceeded'        // 沙箱内存超出
  | 'static-analysis-failed'         // 静态分析失败
  | 'confidence-too-low'             // 置信度过低
  | 'unknown';
```

### StagentError（类型化引擎错误）

定义于 `src/ErrorTypeUtils.ts`。`classifyThrownError` 优先读 `StagentError.errorType`；工厂包括 `implHollowOutput()`、`llmContextOverflow()`、`invariantViolation()` 等。

### BackendMessage（UI 消息）

**单点定义**：`src/workflow-types/MessageTypes.ts`（由 `scripts/check-message-schema.mjs` 校验，当前 24 种 backend 类型）。

```typescript
// 扩展 → Webview（节选；完整 union 见 MessageTypes.ts）

type BackendMessage =
  // 生成
  | { type: 'generationProgress'; operation: GenerationOperationId; phase: 'preparing'|'llm'|'parsing'|'validating'; message: string; detail?: string }
  | { type: 'generationCancelled'; reason?: string }
  | { type: 'workflowGenerated'; workflow: WorkflowDefinition; blocked?: boolean; blockReasons?: string[]; instanceKey?: string; sessionId?: string; ... }
  | { type: 'clarifyQuestions'; questions: Array<{ id; text; options? }> }
  | { type: 'userTaskPolished'; text: string; polishedAt: string; fromCache?: boolean; instanceKey?: string; sessionId?: string }
  | { type: 'workflowFailed'; reason: string; errorType: ErrorType; stageId?: string; traceId?: string }

  // 执行
  | { type: 'stageStatusUpdate'; stageId: string; status: StageStatus; isDecisionStage?: boolean; retryDisabled?: boolean }
  | { type: 'stageOutputUpdate'; stageId: string; outputKey: string; content: unknown }
  | { type: 'streamChunk'; stageId: string; chunk: string }
  | { type: 'stageError'; stageId: string; error: string; errorType: ErrorType; traceId?: string; userTitle?: string; playbookSteps?: string[]; stdout?; stderr? }
  | { type: 'stageQuestionsBefore' | 'stageQuestions'; stageId: string; questions: Question[] }
  | { type: 'stageConfidenceUpdate'; stageId: string; score: number; level: 'high'|'medium'|'low'|'critical'; reasons: string[] }
  | { type: 'dagWaveUpdate'; waveIndex: number; activeStageIds: string[]; phase: 'start'|'complete' }
  | { type: 'workflowCompleted'; warnings?: string[]; traceId?: string }

  // HITL / 实例
  | { type: 'downstreamReset'; decisionStageId: string; resetStageIds: string[]; ... }
  | { type: 'stageArtifactHints'; stageId: string; artifacts: StageArtifactHint[] }
  | { type: 'actionHint'; message: string; stageId?: string }
  | { type: 'instanceKeySynced' | 'sessionSynced'; instanceKey: string; sessionId?: string }
  | { type: 'instanceResumed'; instanceKey: string; workflow: WorkflowDefinition; instanceStatus: WorkflowStatus; stageStatuses?: Record<string, StageStatus> }
  | { type: 'instanceSwitchBlocked'; reason: string; targetInstanceKey: string; activeInstanceKey?: string }
  | { type: 'llmUsageUpdate'; stageId: string; promptTokens?; completionTokens?; totalTokens? };
```

`WorkflowUiBridge.postMessage` 在出站时为 `stageError` / `workflowFailed` / `workflowCompleted` 自动附加 `traceId`（来自 `instance.traceId`）。

---

## 2️⃣ 宿主接口契约

### EngineHostFactoryDeps（四切片聚合）

**定义**：`src/engine-host/index.ts`  
**构建**：`EngineHostFactoryBuilder.build()` → 缓存于 `WorkflowEngineHostRegistry`  
**消费**：各 runner 通过角色子类型取切片（ISP，成员上限 25，见 `architecture-interface-ceiling.test.ts`）

```typescript
interface EngineHostFactoryDeps
  extends MessagingHostDeps,
    PersistenceHostDeps,
    GenerationHostDeps,
    ExecutionHostDeps {
  context: vscode.ExtensionContext;
  maxStageWarn: number;
  getGenerationSeq: () => number;
}

// MessagingHostDeps（src/engine-host/MessagingHostDeps.ts）
interface MessagingHostDeps {
  bindPanel(panel): void;
  postMessage(panel, msg: BackendMessage): void;
  postGenerationProgress(panel, operation, phase, message, detail?): void;
  warn(message: string): void;
  degraded(reason: string, context?: Record<string, unknown>): void;  // 引擎降级 SSOT
  error(message: string): void;
  debugLog(stageId, event, attempt, payload?): void;
  logUserAction(kind, detail): void;
  flushMetrics?(reason: string): void;
}

// 角色子类型（同文件）
type PreGenerationHostDeps = MessagingHostDeps & Pick<GenerationHostDeps, ...> & ...
type GenerationRunnerHostDeps = MessagingHostDeps & GenerationHostDeps & ...
type HitlHostDeps = MessagingHostDeps & PersistenceHostDeps & ExecutionHostDeps & ...
type StartExecutionHostDeps = MessagingHostDeps & PersistenceHostDeps & ExecutionHostDeps & ...
```

宿主对象由 `WorkflowEngineHostRegistry` **缓存**（`pathHost`、`stageExecutionHost`、`hitlHost` 等），避免每次调用重建。

### WorkflowEngineExecutionHost（阶段执行窄接口）

**定义**：`src/execution-bindings/types.ts`  
**实现**：`createStageExecutionHost()`（`StageExecutionHost.ts`）

```typescript
type WorkflowEngineExecutionHost =
  ExecutionMessagingHost &   // postMessage, scheduleSave, debugLog, logUserAction
  ExecutionLlmHost &           // resolveInput, executeLlmText, applyPatchInstructions
  ExecutionPathHost &          // ensureTaskDir, resolveOutputPath, trackPersistedFile
  ExecutionQualityHost;        // runCodeRunner, runWorkspaceContractLint, runSdkPathContractHardGate

// 执行循环入参同样切片（executor-loop-types.ts）：
type ExecuteNextStageLoopParams =
  ExecutionInstanceSlice & ExecutionMessagingSlice & ExecutionLlmSlice &
  ExecutionPathSlice & ExecutionControlSlice & ExecutionQualitySlice;
```

质量门运行时能力见 `QualityGateHostInput`（`ExecutionQualityHost` 子集 + `debugLog` + `resolveCodeRunnerCwd`）。

### llm-text systemPrompt 拼装（`StageInputResolutionService`）

每次 llm-text 执行前，在 stage 正文之后依次 append：

```
stage.toolConfig.systemPrompt
  → buildGlobalDecisionSystemPromptBlock()   // 已批准 DecisionRecord（动态增长）
  → buildCharterConstraintsBlock()           // Charter avoid + constraint（静态全量）
```

模块：`GlobalDecisionContext.ts`、`charter/CharterConstraintsBlock.ts`、`charter/CharterContextService.ts`。

### QualityGateExecutionHost（质量门执行能力）

```typescript
interface QualityGateExecutionHost {
  // 环境查询
  getWorkspaceRootAbsolute: () => string | undefined;
  
  // 代码执行
  resolveCodeRunnerCwd: (cfg: CodeRunnerConfig, instanceKey: string) => string;
  runCodeRunner: (
    cfg: CodeRunnerConfig,
    instanceKey: string,
    stageId: string
  ) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
  
  // Lint 检验
  runWorkspaceContractLint: () => Promise<string[]>;
  runSdkPathContractHardGate: () => Promise<SdkPathContractIssue | null>;
  runPostImplStaticAnalysis: () => Promise<string[]>;
  
  // 配置查询
  readRedGreenGateMode: () => 'off' | 'warn' | 'hard';
  readDebugFeedbackLoopRuntimeHard: () => boolean;
  readTestRunPreflightEnabled: () => boolean;
  readSdkPathContractLintMode: () => 'off' | 'warn' | 'hard';
  readStaticAnalysisEnabled: () => boolean;
}
```

### HitlCoordinatorHost（HITL 动作协调）

```typescript
interface HitlCoordinatorHost {
  // 审批相关
  handleApprove: (panel: vscode.WebviewPanel, stageId: string) => Promise<void>;
  handleApproveDecision: (panel: vscode.WebviewPanel, stageId: string) => Promise<void>;
  
  // 问卷相关
  handleAnswerQuestions: (panel: vscode.WebviewPanel, stageId: string, answers: Record<string, string>) => Promise<void>;
  handleAnswerQuestionsBefore: (panel: vscode.WebviewPanel, stageId: string, answers: Record<string, string>) => Promise<void>;
  
  // 重试
  handleRetry: (panel: vscode.WebviewPanel, stageId: string, comment?: string) => Promise<void>;
}
```

---

## 3️⃣ 消息通信协议

### Webview → 扩展（FrontendMessage）

**单点定义**：`src/workflow-types/MessageTypes.ts`（当前 16 种 frontend 类型）

```typescript
type FrontendMessage =
  | { type: 'webviewReady' }
  | { type: 'generateWorkflow'; userInput: string; taskType?: string; taskWorkspacePath: string; clarifyAnswers?: Record<string, string>; polishContext?: {...} }
  | { type: 'clarifyStart'; userInput: string; taskType?: string; taskWorkspacePath: string }
  | { type: 'polishUserTask'; draft: string; taskType?: string; taskWorkspacePath?: string }
  | { type: 'pickTaskWorkspaceFolder' }
  | { type: 'startExecution'; workflow?: WorkflowDefinition; sessionId?: string; instanceKey?: string }
  | { type: 'approve'; stageId: string }
  | { type: 'approveDecision'; stageId: string; decisionRecord: string; sessionId?: string; instanceKey?: string }
  | { type: 'answerQuestionsBefore' | 'answerQuestions'; stageId: string; answers: Record<string, string> }
  | { type: 'retry'; stageId: string; comment: string }
  | { type: 'editOutput'; stageId: string; outputKey: string; newContent: unknown }
  | { type: 'openArtifactDiff' | 'openArtifactFile'; stageId: string; filePath: string }
  | { type: 'copyDebugLog' | 'copySessionLog' };
```

### 消息路由

```
Webview postMessage
  → WorkflowPanelMessageRouter / panel-handlers/*
  → engine.generation | engine.execution | engine.hitl | engine.instances
  → WorkflowUiBridge.postMessage
       ├─ enrichCorrelationFields（traceId）
       ├─ applyPostMessageSideEffects（stageError → failure JSONL、experience）
       └─ webview.postMessage
```

入站消息经 `WebviewMessageGuards.isFrontendMessage` 校验；`sessionId` 解析见 `InstanceSession.resolveSessionForAction`。

---

## 4️⃣ 输入/输出合并策略

### mergeStrategy: 'concat'

将所有 source 值用 `\n\n` 连接。

```typescript
// 示例
sources: [
  { type: 'user-input', value: '用户输入文本' },
  { type: 'stage-output', stageId: 'stage_1', outputKey: 'analysis' }
]

// 结果
userContent = "用户输入文本\n\n前一个 stage 的分析结果"
```

### mergeStrategy: 'template'

使用 `mergeTemplate` 模板，替换 `${source_key}` 占位符。

```typescript
// 示例
mergeStrategy: 'template'
mergeTemplate: "# 任务\n${task}\n# 上下文\n${context}"
sources: [
  { type: 'constant', value: '编写单元测试', outputKey?: 'task' },
  { type: 'file', filePath: 'README.md', outputKey?: 'context' }
]

// 结果
userContent = "# 任务\n编写单元测试\n# 上下文\n(README.md 内容)"
```

### mergeStrategy: 'object'

将所有 source 合并为单个 JSON 对象。

```typescript
// 示例
sources: [
  { type: 'stage-output', stageId: 'stage_1', outputKey: 'code' },
  { type: 'stage-output', stageId: 'stage_1', outputKey: 'error' }
]

// 结果
userContent = JSON.stringify({
  code: "前一个 stage 的代码",
  error: "前一个 stage 的错误"
})
```

---

## 5️⃣ 上下文压缩策略

### contextMode: 'full'

保留完整内容，不压缩。

### contextMode: 'summary'

生成内容摘要（由 `formatSnapshotForPrompt` 实现）。

```typescript
// 代码文件 → 摘要
// 完整代码：500 行
// 摘要：
// - 文件目的
// - 主要函数列表（名称、签名）
// - 关键逻辑梗概
```

### contextMode: 'reference'

仅保留引用（文件路径、行号等）。

```typescript
// 引用格式：
// src/utils/helpers.ts (行 1-50, 200 tokens)
// → 完整内容需要时由 stage-output 取得
```

---

## 6️⃣ 工作流定义规范（SPEC-v2）

### 强制约束

1. **每个 stage 必须有唯一 id**
   - 规范：`stage_[purpose]_[number]`
   - 例子：`stage_impl_1`, `stage_test_1`, `stage_zoom_out`

2. **outputs 必须有至少一个**
   - 除非 `skipIf` 条件为真

3. **决策阶段必须存在**
   - 工作流必须包含一个 `isDecisionStage=true` 的 stage
   - 或由引擎自动插入一个

4. **input.sources 至少一个**
   - 可以是常量、用户输入或前置 stage 输出

5. **dependsOn 引用必须存在**
   - DAG 模式下，依赖的 stage 必须在本阶段之前

### 推荐实践

1. **工具选择原则**
   - llm-text：需要 LLM 推理的工作
   - code-runner：需要代码执行验证（test_run / smoke / verify）
   - file-write：需要持久化输出
   - file-read：需要读取项目文件
   - user-prompt：**勿用**（类型存在但 `non-llm-runners` 未实现）；人工介入用 `isDecisionStage`、`questionBefore` / `questionAfter`、`pauseAfter` + HITL

2. **pauseAfter 使用**
   - 关键决策点
   - 代码生成后的审核
   - 大范围文件修改前

3. **质量门注册**
   - 不要在 stage 内实现质量检查
   - 通过实现 QualityGate 接口并注册
   - 便于重用和 mock

4. **错误处理**
   - 关键 stage：strategy='pause'
   - 可重试 stage：strategy='retry', maxRetries=3
   - 非关键 stage：strategy='skip'

---

## 7️⃣ 扩展点

### 添加新质量门

```typescript
// 1. 在 QualityGateIds.ts 增加 GATE_ID_*（内置门须加入 BUILTIN_QUALITY_GATE_IDS）
// 2. 在 quality-gates/{generate,preStage,postStage}Gates.ts 定义 gate
const myGate: QualityGate = {
  id: 'my-custom-gate',
  label: 'My Custom Gate',
  phase: 'post-stage',
  priority: 50,
  evaluate: async (ctx) => {
    const warnings = await ctx.executionHost?.runWorkspaceContractLint();
    return warnings.length
      ? { gateId: 'my-custom-gate', severity: 'warn', messages: warnings }
      : null;
  },
};

// 3. 注册（扩展或 fork 时）
import { registerQualityGate } from './QualityGate';
registerQualityGate(myGate);

// 内置门：registerBuiltinQualityGates() 在 extension activate 时调用
// 执行：QualityGateRunner / runPreGateRegistry 按 phase + priority 调度
```

内置 18 个 gate id 清单见 `src/QualityGateIds.ts` 与 `ARCHITECTURE_FLOWS.md` §4。

### 添加新工具类型

```typescript
// 1. 定义 ToolConfig
interface MyToolConfig {
  type: 'my-tool';
  config: string;
  // ...
}

// 2. 扩展 ToolType union
type ToolType = ... | 'my-tool';

// 3. 实现执行器
const result = await stageExecutionHost.executeMy Tool(config, stageId);

// 4. 在 executeStage 中添加分支
if (stage.tool === 'my-tool') {
  result = await stageExecutionHost.executeMyTool(...);
}
```

### 添加新输入源类型

```typescript
// 1. 扩展 InputSource.type union
type InputSourceType = ... | 'my-source';

// 2. 在 resolveInput 中处理
if (source.type === 'my-source') {
  value = await customResolveMySource(source);
}
```

---

## 8️⃣ 性能考虑

### Token 计算

```typescript
// 每次调用 LLM 前估算 token
const inputTokens = estimateTokens(userContent);
const maxOutputTokens = readLlmMaxOutputTokens(); // 通常 8K
const totalTokens = inputTokens + maxOutputTokens + systemPromptTokens;

if (totalTokens > modelLimit) {
  // 自动降级输入上下文
  applyInputContextDegradation();
}
```

### 缓存策略

```typescript
// 1. Polish 缓存（生成前）
const cacheKey = polishCacheKey(draft, taskType);
if (polishCache.has(cacheKey)) {
  polishedText = polishCache.get(cacheKey);
} else {
  polishedText = await invokeLlm('polish', draft);
  polishCache.set(cacheKey, polishedText);
}

// 2. 模型缓存（LlmClient）
if (modelCache && modelCache.family === preferredModelFamily) {
  models = modelCache.models;
} else {
  models = await selectChatModels();
  modelCache = { family: preferredModelFamily, models };
}
```

### 并发限制

```typescript
// DAG 执行时限制并发
const maxParallelism = readEngineDagMaxParallelism(); // 通常 3-5
// 仅当 activeStageIds.size < maxParallelism 时启动新 stage
```

---

## 9️⃣ 错误恢复

### 实例恢复流程

```typescript
// 1. 从磁盘或 globalState 读取 instance
const persisted = await loadInstance(instanceKey);

// 2. 验证完整性
if (!persisted || !persisted.definition) {
  throw new Error('Corrupted instance');
}

// 3. 恢复执行状态
const lastError = persisted.stageRuntimes[currentStageIndex]?.lastError;
if (lastError && lastError.errorType === 'retry-limit-exceeded') {
  stageRuntime.status = 'paused';
  // 等待用户 approve/retry
}

// 4. 继续执行
await executeNextStageLoop(panel);
```

### 部分失败处理

```typescript
// DAG 执行中某个 stage 失败
if (stage.onError.strategy === 'pause') {
  // 暂停该 stage，继续执行不依赖它的其他 stage
  activeStageIds.delete(stageId);
  postMessage(UI, {type: 'stagePaused', stageId});
}
```

---

## 🔟 测试 Contracts

### Mock WorkflowEngine

```typescript
const mockEngine: Partial<WorkflowEngine> = {
  instances: {
    setInstance: jest.fn(),
    getInstance: jest.fn(() => mockInstance),
    // ...
  },
  generation: {
    generateWorkflow: jest.fn(async () => mockDef),
    // ...
  },
  // ...
};
```

### Mock EngineHostFactoryDeps

```typescript
const mockDeps: EngineHostFactoryDeps = {
  getInstance: jest.fn(() => mockInstance),
  setInstance: jest.fn(),
  postMessage: jest.fn(),
  executeNextStage: jest.fn(),
  // ... 其他所有必需方法
};
```

### 质量门单测

```typescript
it('should detect decision stage missing', async () => {
  const ctx: QualityGateContext = {
    phase: 'generate',
    workflow: workflowWithoutDecision,
  };
  
  const result = await myGate.evaluate(ctx);
  
  expect(result.severity).toBe('block');
  expect(result.messages).toContain('Decision stage not found');
});
```
