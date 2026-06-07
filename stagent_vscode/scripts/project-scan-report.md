lines 532
项目扫描（机器可读副本）

## 1. 全项目文件清单

| 路径 | 行数 | 主要职责 |
| --- | ---: | --- |
| `.c8rc.json` | 13 | 模块 .c8rc（路径 .）。 |
| `.github/workflows/verify-all.yml` | 29 | CI 工作流或 GitHub 配置。 |
| `.github/workflows/verify-fixtures.yml` | 28 | CI 工作流或 GitHub 配置。 |
| `.github/workflows/verify-lint-test.yml` | 25 | CI 工作流或 GitHub 配置。 |
| `.github/workflows/verify-prompts.yml` | 48 | CI 工作流或 GitHub 配置。 |
| `.github/workflows/verify-webview.yml` | 52 | CI 工作流或 GitHub 配置。 |
| `.gitignore` | 25 | 模块 .gitignore（路径 .）。 |
| `.vscodeignore` | 36 | 模块 .vscodeignore（路径 .）。 |
| `AGENTS.md` | 52 | 模块 AGENTS（路径 .）。 |
| `CHANGELOG.md` | 26 | 模块 CHANGELOG（路径 .）。 |
| `CONTRIBUTING.md` | 66 | 模块 CONTRIBUTING（路径 .）。 |
| `docs/architecture.md` | 96 | 项目文档：architecture。 |
| `docs/dag-scheduling.md` | 52 | 项目文档：dag-scheduling。 |
| `docs/esm-migration-spike.md` | 49 | 项目文档：esm-migration-spike。 |
| `docs/persistence.md` | 65 | 项目文档：persistence。 |
| `docs/preact-spike.md` | 28 | 项目文档：preact-spike。 |
| `docs/quality-gates.md` | 77 | 项目文档：quality-gates。 |
| `docs/README.md` | 26 | 项目文档：README。 |
| `docs/settings/README.md` | 177 | 项目文档：README。 |
| `eslint.config.mjs` | 59 | 模块 eslint.config（路径 .）。 |
| `examples/custom-quality-gate.ts` | 25 | 示例：在 fork 的 extension activate() 中注册自定义 QualityGate。 |
| `examples/sample-tasks.md` | 48 | 示例：sample-tasks。 |
| `package.json` | 485 | 模块 package（路径 .）。 |
| `package.nls.json` | 12 | 模块 package.nls（路径 .）。 |
| `package.nls.zh-cn.json` | 12 | 模块 package.nls.zh-cn（路径 .）。 |
| `prompts/artifact-input-alignment.md` | 30 | LLM 提示词模板：artifact-input-alignment。 |
| `prompts/decision-record-strict-suffix.md` | 17 | LLM 提示词模板：decision-record-strict-suffix。 |
| `prompts/engineering-test-strategy-borrowing.md` | 17 | LLM 提示词模板：engineering-test-strategy-borrowing。 |
| `prompts/generator-json-schema-base.md` | 20 | LLM 提示词模板：generator-json-schema-base。 |
| `prompts/layer-1-to-5.md` | 23 | LLM 提示词模板：layer-1-to-5。 |
| `prompts/main-assembly-naming.md` | 5 | LLM 提示词模板：main-assembly-naming。 |
| `prompts/manifest.json` | 90 | LLM 提示词模板：manifest。 |
| `prompts/prototype-excel-fixture-alignment.md` | 11 | LLM 提示词模板：prototype-excel-fixture-alignment。 |
| `prompts/prototype-multi-file-write.md` | 21 | LLM 提示词模板：prototype-multi-file-write。 |
| `prompts/python-code-runner-constraint.md` | 14 | LLM 提示词模板：python-code-runner-constraint。 |
| `prompts/rule20-system.md` | 65 | LLM 提示词模板：rule20-system。 |
| `prompts/spec-75-original.md` | 25 | LLM 提示词模板：spec-75-original。 |
| `prompts/spec-78-multi-module.md` | 23 | LLM 提示词模板：spec-78-multi-module。 |
| `prompts/task-type-classification.md` | 15 | LLM 提示词模板：task-type-classification。 |
| `prompts/task-type/debug-constraint.md` | 16 | LLM 提示词模板：debug-constraint。 |
| `prompts/task-type/improve-architecture-constraint.md` | 12 | LLM 提示词模板：improve-architecture-constraint。 |
| `prompts/task-type/prototype-constraint.md` | 27 | LLM 提示词模板：prototype-constraint。 |
| `prompts/task-type/refactor-constraint.md` | 16 | LLM 提示词模板：refactor-constraint。 |
| `prompts/test-infrastructure-before-test-run.md` | 29 | LLM 提示词模板：test-infrastructure-before-test-run。 |
| `prompts/vertical-slice-constraint.md` | 12 | LLM 提示词模板：vertical-slice-constraint。 |
| `README.md` | 63 | 模块 README（路径 .）。 |
| `schemas/messages.schema.json` | 72 | JSON Schema：messages.schema。 |
| `scripts/analyze-experiences.ts` | 62 | 构建/校验脚本：analyze-experiences。 |
| `scripts/analyze-failures.ts` | 100 | 构建/校验脚本：analyze-failures。 |
| `scripts/build-prompts.mjs` | 116 | 构建/校验脚本：build-prompts。 |
| `scripts/build-webview.mjs` | 170 | 构建/校验脚本：build-webview。 |
| `scripts/check-critical-coverage.mjs` | 58 | 构建/校验脚本：check-critical-coverage。 |
| `scripts/check-message-schema-contract.mjs` | 43 | 构建/校验脚本：check-message-schema-contract。 |
| `scripts/extract-prompts-from-workflow-prompts.mjs` | 68 | 构建/校验脚本：extract-prompts-from-workflow-prompts。 |
| `scripts/extract-webview-templates.mjs` | 96 | CSS from WebviewStyles.ts |
| `scripts/fixtures/confidence/high-quality-decision.md` | 15 | Rule20/校验夹具：confidence/high-quality-decision.md。 |
| `scripts/fixtures/confidence/high-quality-decision.meta.json` | 6 | Rule20/校验夹具：confidence/high-quality-decision.meta.json。 |
| `scripts/fixtures/confidence/hollow-impl-output.meta.json` | 6 | Rule20/校验夹具：confidence/hollow-impl-output.meta.json。 |
| `scripts/fixtures/confidence/missing-sections-decision.md` | 8 | Rule20/校验夹具：confidence/missing-sections-decision.md。 |
| `scripts/fixtures/confidence/missing-sections-decision.meta.json` | 6 | Rule20/校验夹具：confidence/missing-sections-decision.meta.json。 |
| `scripts/fixtures/debug/fail-feedback-loop-order.json` | 43 | Rule20/校验夹具：debug/fail-feedback-loop-order.json。 |
| `scripts/fixtures/debug/pass-minimal.json` | 62 | Rule20/校验夹具：debug/pass-minimal.json。 |
| `scripts/fixtures/debug/warn-missing-reproduce.json` | 43 | Rule20/校验夹具：debug/warn-missing-reproduce.json。 |
| `scripts/fixtures/debug/warn-missing-verification.json` | 53 | Rule20/校验夹具：debug/warn-missing-verification.json。 |
| `scripts/fixtures/prototype/fail-missing-config-py-import.json` | 84 | Rule20/校验夹具：prototype/fail-missing-config-py-import.json。 |
| `scripts/fixtures/prototype/pass-minimal.json` | 41 | Rule20/校验夹具：prototype/pass-minimal.json。 |
| `scripts/fixtures/prototype/warn-missing-success-criteria.json` | 31 | Rule20/校验夹具：prototype/warn-missing-success-criteria.json。 |
| `scripts/fixtures/prototype/warn-missing-verification.json` | 32 | Rule20/校验夹具：prototype/warn-missing-verification.json。 |
| `scripts/fixtures/refactor/minimal-warning-monolithic-no-verify.json` | 35 | Rule20/校验夹具：refactor/minimal-warning-monolithic-no-verify.json。 |
| `scripts/fixtures/refactor/minimal-warning-no-decision.json` | 40 | Rule20/校验夹具：refactor/minimal-warning-no-decision.json。 |
| `scripts/fixtures/refactor/pass-minimal.json` | 62 | Rule20/校验夹具：refactor/pass-minimal.json。 |
| `scripts/fixtures/rule20/fail-missing-constraint-prompt.json` | 45 | Rule20/校验夹具：rule20/fail-missing-constraint-prompt.json。 |
| `scripts/fixtures/rule20/fail-missing-decision-source.json` | 38 | Rule20/校验夹具：rule20/fail-missing-decision-source.json。 |
| `scripts/fixtures/rule20/fail-test-run-not-code-runner.json` | 63 | Rule20/校验夹具：rule20/fail-test-run-not-code-runner.json。 |
| `scripts/fixtures/rule20/pass-minimal.json` | 45 | Rule20/校验夹具：rule20/pass-minimal.json。 |
| `scripts/fixtures/rule20/warn-missing-global-architecture.json` | 119 | Rule20/校验夹具：rule20/warn-missing-global-architecture.json。 |
| `scripts/fixtures/runtime-rule20/fail-missing-decision-stage.json` | 41 | Rule20/校验夹具：runtime-rule20/fail-missing-decision-stage.json。 |
| `scripts/fixtures/runtime-rule20/pass-minimal-todo-extension.json` | 70 | Rule20/校验夹具：runtime-rule20/pass-minimal-todo-extension.json。 |
| `scripts/fixtures/runtime-rule20/README.md` | 27 | Rule20/校验夹具：runtime-rule20/README.md。 |
| `scripts/fixtures/runtime-rule20/warn-missing-architecture.json` | 165 | Rule20/校验夹具：runtime-rule20/warn-missing-architecture.json。 |
| `scripts/fixtures/to-issues-audit/workflow-theme-a-search-index.json` | 112 | Rule20/校验夹具：to-issues-audit/workflow-theme-a-search-index.json。 |
| `scripts/fixtures/to-issues-audit/workflow-theme-b-billing-retry.json` | 112 | Rule20/校验夹具：to-issues-audit/workflow-theme-b-billing-retry.json。 |
| `scripts/fixtures/to-issues-audit/workflow-theme-c-auth-session.json` | 75 | Rule20/校验夹具：to-issues-audit/workflow-theme-c-auth-session.json。 |
| `scripts/fixtures/to-issues-audit/workflow-theme-d-cache-invalidation.json` | 75 | Rule20/校验夹具：to-issues-audit/workflow-theme-d-cache-invalidation.json。 |
| `scripts/fixtures/to-issues-audit/workflow-theme-e-api-rate-limit.json` | 75 | Rule20/校验夹具：to-issues-audit/workflow-theme-e-api-rate-limit.json。 |
| `scripts/fixtures/to-issues-audit/workflow-warning-high-hitl.json` | 59 | Rule20/校验夹具：to-issues-audit/workflow-warning-high-hitl.json。 |
| `scripts/fixtures/to-issues-audit/workflow-warning-horizontal-layering.json` | 116 | Rule20/校验夹具：to-issues-audit/workflow-warning-horizontal-layering.json。 |
| `scripts/fixtures/to-issues-audit/workflow-warning-missing-chain.json` | 44 | Rule20/校验夹具：to-issues-audit/workflow-warning-missing-chain.json。 |
| `scripts/gen-message-schema.mjs` | 86 | 构建/校验脚本：gen-message-schema。 |
| `scripts/gen-webview-id-snapshots.mjs` | 29 | 构建/校验脚本：gen-webview-id-snapshots。 |
| `scripts/project-scan.mjs` | 253 | 构建/校验脚本：project-scan。 |
| `scripts/run-unit-tests.mjs` | 20 | 构建/校验脚本：run-unit-tests。 |
| `scripts/split-webview-runtime.mjs` | 485 | 构建/校验脚本：split-webview-runtime。 |
| `scripts/sync-settings-contributes.mjs` | 134 | 构建/校验脚本：sync-settings-contributes。 |
| `scripts/v281-e2e-observation.ts` | 142 | v2.8.1 / M20 前置：对 fixture 工作流批量跑 verifyRule20，模拟 E2E 观测通过率。 |
| `scripts/verify-quality-scorer.ts` | 135 | 构建/校验脚本：verify-quality-scorer。 |
| `scripts/verify-rule20.ts` | 166 | 构建/校验脚本：verify-rule20。 |
| `src/.gitkeep` | 2 | 模块 .gitkeep（路径 src）。 |
| `src/ActiveInstanceGuard.ts` | 31 | #5：单引擎活跃实例切换守卫（非多实例队列，仅防执行中误切换与丢盘）。 |
| `src/AdaptiveHITLPolicy.ts` | 111 | 导出 HITLDecision 及相关类型/工具。 |
| `src/AdrPersistence.ts` | 77 | M34 / #13：ADR 磁盘读写（`.stagent/adr/`）。纯 fs 封装，无 vscode 依赖。 |
| `src/AdrStore.ts` | 200 | M24：轻量 ADR（Architecture Decision Record）留存（借鉴 skills `grill-with-docs` |
| `src/AgentSpecializationRouter.ts` | 96 | 导出 AgentRole 及相关类型/工具。 |
| `src/ApproveDecisionGate.ts` | 37 | 导出 ApproveDecisionGateInput，承担对应领域编排或策略。 |
| `src/ArtifactLifecycleManager.ts` | 225 | 阶段产物状态机与磁盘持久化。 |
| `src/ArtifactUiHints.ts` | 196 | 产物 Webview 展示提示。 |
| `src/BuiltinQualityGates.ts` | 417 | 内置 QualityGate 注册 — 将原生成/执行链中的硬编码 lint 统一挂到注册表。 |
| `src/CodebaseContextProvider.ts` | 276 | 导出 ProjectType 及相关类型/工具。 |
| `src/CodeRunnerCommandLint.ts` | 309 | code-runner 危险命令检测。 |
| `src/CodeRunnerImportLint.ts` | 271 | Python import 路径一致性 lint。 |
| `src/CodeRunnerInvokeHelpers.ts` | 110 | code-runner 执行期策略：沙箱网络放行、超时秒数解析、生成工作流 timeout 字段归一化。 |
| `src/ConfidenceScorer.ts` | 160 | 导出 CONFIDENCE_OUTPUT_KEY 及相关类型/工具。 |
| `src/ConfigContractLint.ts` | 189 | 导出 ConfigContractIssue 及相关类型/工具。 |
| `src/CrossFileKeyContractLint.ts` | 317 | M21.1b：跨文件键名一致性 lint（运行期，test_run 前）。 |
| `src/DebugFeedbackLoopGate.ts` | 76 | 导出 DebugFeedbackLoopOutcome 及相关类型/工具。 |
| `src/DebugLogUtils.ts` | 24 | 导出 getRecentDebugLogLines 及相关类型/工具。 |
| `src/DecisionContentLintPolicy.ts` | 10 | 导出 isDecisionContentLintEnabled，承担对应领域编排或策略。 |
| `src/DecisionRecordVerify.ts` | 200 | 导出 DecisionViolationCode 及相关类型/工具。 |
| `src/DecisionReviewUi.ts` | 54 | 导出 shouldShowQualitySoftPrompt 及相关类型/工具。 |
| `src/DependencyGraphAnalyzer.ts` | 239 | 导出 DependencyLayer 及相关类型/工具。 |
| `src/EffectiveSettings.ts` | 58 | 有效配置：workflow.globalConfig 显式值 > vscode stagent.* > 调用方传入 default。 |
| `src/engine-host/ExecutionHostDeps.ts` | 10 | WorkflowEngine Host 依赖切片：ExecutionHostDeps。 |
| `src/engine-host/GenerationHostDeps.ts` | 31 | WorkflowEngine Host 依赖切片：GenerationHostDeps。 |
| `src/engine-host/index.ts` | 60 | WorkflowEngine Host 依赖切片：index。 |
| `src/engine-host/MessagingHostDeps.ts` | 20 | WorkflowEngine Host 依赖切片：MessagingHostDeps。 |
| `src/engine-host/PersistenceHostDeps.ts` | 40 | WorkflowEngine Host 依赖切片：PersistenceHostDeps。 |
| `src/ErrorTypeUtils.ts` | 104 | 导出 normalizeErrorType 及相关类型/工具。 |
| `src/ExperienceGeneratorContext.ts` | 84 | 导出 buildExperienceFewShotForGenerator 及相关类型/工具。 |
| `src/extension.ts` | 316 | VS Code 扩展激活入口与命令注册。 |
| `src/FailurePatternAnalyzer.ts` | 159 | 导出 ActionablePatternKind 及相关类型/工具。 |
| `src/FsAsync.ts` | 90 | 异步文件读写薄封装。 |
| `src/generated/PromptFragments.ts` | 554 | 由 prompts/ 构建生成的提示词常量。 |
| `src/GeneratedWorkflowGate.ts` | 21 | 导出 formatRule20ViolationsBlockReason 及相关类型/工具。 |
| `src/GlobalDecisionContext.ts` | 158 | 导出 STAGENT_GLOBAL_DECISIONS_LABEL 及相关类型/工具。 |
| `src/GrillAdaptiveFlow.ts` | 103 | 导出 AdaptiveGrillState 及相关类型/工具。 |
| `src/GrillCodeExplore.ts` | 160 | 导出 CodeExploreHit 及相关类型/工具。 |
| `src/GrillLoopPolicy.ts` | 98 | 导出 DEFAULT_MAX_GRILL_ROUNDS 及相关类型/工具。 |
| `src/HITLContractNodePolicy.ts` | 118 | 导出 DEFAULT_CONTRACT_NODE_PAUSE_THRESHOLD 及相关类型/工具。 |
| `src/ImplOutputExecution.ts` | 32 | 导出 ImplOutputGuardResult 及相关类型/工具。 |
| `src/ImplOutputGuard.ts` | 13 | 导出 isHollowImplOutput 及相关类型/工具。 |
| `src/InputContextPolicy.ts` | 361 | 导出 DEFAULT_CONTEXT_TOTAL_TOKEN_LIMIT 及相关类型/工具。 |
| `src/InstanceSession.ts` | 115 | M44：Webview / Engine 实例一致性 — 单一 Session 模型。 |
| `src/JsonExtract.ts` | 124 | 导出 extractJsonObject 及相关类型/工具。 |
| `src/LlmClient.ts` | 322 | LlmClient（M30.1） |
| `src/LlmInvokeHelpers.ts` | 142 | 与 `package.json` → `stagent.llmTimeoutSeconds` 默认值一致 |
| `src/ManualRetryLimit.ts` | 41 | 与 `package.json` → `stagent.maxManualStageRetries` 默认值一致 |
| `src/ModuleDepthScorer.ts` | 148 | M25：深模块评分（借鉴 skills `improve-codebase-architecture` / Ousterhout「深模块」）。 |
| `src/OpenAiCompatibleLlm.ts` | 153 | 导出 STAGENT_DIRECT_HTTP_VENDOR 及相关类型/工具。 |
| `src/OutputQualityScorer.ts` | 309 | 导出 QUALITY_SCORE_OUTPUT_KEY 及相关类型/工具。 |
| `src/PlanCompletenessGate.ts` | 376 | 导出 PlanCompletenessViolationType 及相关类型/工具。 |
| `src/ProjectGlossaryStore.ts` | 84 | 形如 `- **term** — definition` 或 `- **term**: definition` |
| `src/PromptVersionManager.ts` | 175 | 导出 PromptVersion 及相关类型/工具。 |
| `src/PrototypeContractLint.ts` | 238 | 导出 PrototypeContractWarningType 及相关类型/工具。 |
| `src/QualityGate.ts` | 191 | 质量门接口、phase/when 与 GateResult。 |
| `src/QualityGateContrib.ts` | 37 | 第三方 / 扩展贡献 QualityGate 的公开 API。 |
| `src/QualityGateRunner.ts` | 62 | 质量门调度执行器。 |
| `src/QuestionAfterFlow.ts` | 112 | 导出 buildAnswerQuestionsMessage 及相关类型/工具。 |
| `src/QuestionBeforeFlow.ts` | 26 | 导出 getMissingRequiredQuestionIds 及相关类型/工具。 |
| `src/QuestionNormalization.ts` | 43 | 导出 normalizeQuestions 及相关类型/工具。 |
| `src/RedGreenFsm.ts` | 108 | 导出 ImplRedFsmPhase 及相关类型/工具。 |
| `src/RedGreenGate.ts` | 97 | 导出 RedGreenMode 及相关类型/工具。 |
| `src/RetryOutputPolicy.ts` | 8 | 导出 resetOutputsForNonDecisionRetry 及相关类型/工具。 |
| `src/ReuseStrategy.ts` | 27 | 生成前澄清 `q_files`「如何处理已有文件」选项 ↔ reuseStrategy 的**单一事实源**（#16）。 |
| `src/rule20/architecture.ts` | 34 | Rule20 校验规则：architecture。 |
| `src/rule20/debug-feedback.ts` | 30 | Rule20 校验规则：debug-feedback。 |
| `src/rule20/index.ts` | 16 | Rule20 校验规则：index。 |
| `src/rule20/prototype.ts` | 99 | Rule20 校验规则：prototype。 |
| `src/rule20/types.ts` | 57 | Rule20 校验规则：types。 |
| `src/rule20/verify.ts` | 427 | Rule20 校验规则：verify。 |
| `src/Rule20RuntimeGate.ts` | 75 | Rule20RuntimeGate |
| `src/Rule20Verify.ts` | 16 | Rule20 结构/契约校验（与 CI 同源）。 |
| `src/Rule20WarningDisplay.ts` | 129 | 将 `workflowGenerated.warnings` 中的机器可读 token（M14.4 / I-23） |
| `src/SampleHeaderContractLint.ts` | 146 | 导出 extractExcelHeaderRow 及相关类型/工具。 |
| `src/SandboxExecutor.ts` | 129 | 导出 SandboxOptions 及相关类型/工具。 |
| `src/SdkPathContractLint.ts` | 270 | M39.2：DecisionRecord ↔ impl ↔ test SDK/路径契约 lint。 |
| `src/SessionDebugLog.ts` | 78 | 导出 SESSION_DEBUG_FILENAME 及相关类型/工具。 |
| `src/shared/WebviewMessages.ts` | 6 | P1-1：宿主与 webview 共用的消息类型与 type guard（无 vscode 依赖）。 |
| `src/SseDeltaStream.ts` | 55 | 按行缓冲解析 OpenAI 兼容 SSE，避免 chunk 切断 `data:` 行。 |
| `src/stage-runners/StagePostRunPipeline.ts` | 82 | 阶段执行管线：StagePostRunPipeline。 |
| `src/StageErrorCatalog.ts` | 110 | 导出 StageErrorEntry 及相关类型/工具。 |
| `src/StagentAiControlsProvider.ts` | 123 | 侧栏「Stagent · AI 控制」：对齐 ai-workflow AiControlsProvider 的轻量实现。 |
| `src/StagentOnboarding.ts` | 47 | 导出 runStagentOnboardingIfNeeded 及相关类型/工具。 |
| `src/StagentProfileDiff.ts` | 87 | 导出 buildProfileGateDiff，承担对应领域编排或策略。 |
| `src/StagentProfileHighlights.ts` | 8 | 导出 buildProfileHighlights 及相关类型/工具。 |
| `src/StagentSettings.ts` | 442 | 设置读取、Profile 与 VS Code 配置桥接。 |
| `src/StagentSettingsCatalog.ts` | 250 | M43：配置域目录 — 与 package.json contributes 同步维护。 |
| `src/StagentSettingsDefaults.ts` | 51 | 与 `package.json` → `stagent.confidence.pauseThreshold` 默认值一致 |
| `src/StagentSettingsGovernance.ts` | 16 | M43：配置项治理门面 — 域分组、预设 Profile、矛盾组合检测。 |
| `src/StagentSettingsProfiles.ts` | 92 | 导出 SettingsProfileId 及相关类型/工具。 |
| `src/StagentSettingsValidation.ts` | 179 | 导出 SettingsValidationSeverity 及相关类型/工具。 |
| `src/StagentTaskListProvider.ts` | 91 | 侧栏「Stagent · 任务列表」：移植自 ai-workflow TaskListSidebarProvider。 |
| `src/StaticAnalysisPipeline.ts` | 251 | 导出 AnalysisCheck 及相关类型/工具。 |
| `src/StreamingSummary.ts` | 71 | StreamingSummary |
| `src/TaskPolishPrompt.ts` | 23 | 导出 buildTaskPolishSystemPrompt 及相关类型/工具。 |
| `src/TaskTypeResolution.ts` | 72 | UI / 消息协议：由模型在 generateWorkflow 同次调用中决定 meta.taskType |
| `src/test/active-instance-guard.test.ts` | 116 | active-instance-guard.test 的单元/集成测试。 |
| `src/test/adaptive-hitl-policy.test.ts` | 65 | adaptive-hitl-policy.test 的单元/集成测试。 |
| `src/test/adr-wiring.test.ts` | 101 | adr-wiring.test 的单元/集成测试。 |
| `src/test/agent-specialization-router.test.ts` | 45 | agent-specialization-router.test 的单元/集成测试。 |
| `src/test/analyze-experiences.test.ts` | 38 | analyze-experiences.test 的单元/集成测试。 |
| `src/test/approve-decision-gate.test.ts` | 52 | approve-decision-gate.test 的单元/集成测试。 |
| `src/test/artifact-lifecycle-manager.test.ts` | 194 | artifact-lifecycle-manager.test 的单元/集成测试。 |
| `src/test/artifact-pause-ui.test.ts` | 59 | artifact-pause-ui.test 的单元/集成测试。 |
| `src/test/artifact-ui-hints.test.ts` | 93 | artifact-ui-hints.test 的单元/集成测试。 |
| `src/test/clarify-overlay-esc.test.ts` | 25 | clarify-overlay-esc.test 的单元/集成测试。 |
| `src/test/code-runner-command-lint.test.ts` | 223 | code-runner-command-lint.test 的单元/集成测试。 |
| `src/test/code-runner-import-lint.test.ts` | 134 | code-runner-import-lint.test 的单元/集成测试。 |
| `src/test/code-runner-invoke-helpers.test.ts` | 105 | code-runner-invoke-helpers.test 的单元/集成测试。 |
| `src/test/codebase-context-provider.test.ts` | 56 | codebase-context-provider.test 的单元/集成测试。 |
| `src/test/confidence-scorer.test.ts` | 186 | confidence-scorer.test 的单元/集成测试。 |
| `src/test/config-contract-lint.test.ts` | 133 | config-contract-lint.test 的单元/集成测试。 |
| `src/test/contract-source-detection.test.ts` | 110 | contract-source-detection.test 的单元/集成测试。 |
| `src/test/cross-file-context-authority.test.ts` | 27 | cross-file-context-authority.test 的单元/集成测试。 |
| `src/test/cross-file-key-contract-lint.test.ts` | 74 | cross-file-key-contract-lint.test 的单元/集成测试。 |
| `src/test/debug-e2e-mock-chain.test.ts` | 112 | debug-e2e-mock-chain.test 的单元/集成测试。 |
| `src/test/debug-feedback-loop-gate.test.ts` | 77 | debug-feedback-loop-gate.test 的单元/集成测试。 |
| `src/test/debug-feedback-loop-rule20.test.ts` | 37 | debug-feedback-loop-rule20.test 的单元/集成测试。 |
| `src/test/debug-log-utils.test.ts` | 35 | debug-log-utils.test 的单元/集成测试。 |
| `src/test/decision-record-verify.test.ts` | 234 | decision-record-verify.test 的单元/集成测试。 |
| `src/test/deep-defense.test.ts` | 62 | 用两个**内部常量中独特出现**的短语作为存在性 / 计数锚点，避免依赖未导出的常量 |
| `src/test/dependency-graph-analyzer.test.ts` | 42 | dependency-graph-analyzer.test 的单元/集成测试。 |
| `src/test/downstream-reset-ui.test.ts` | 38 | downstream-reset-ui.test 的单元/集成测试。 |
| `src/test/effective-settings.test.ts` | 38 | effective-settings.test 的单元/集成测试。 |
| `src/test/error-type-utils.test.ts` | 49 | error-type-utils.test 的单元/集成测试。 |
| `src/test/experience-generator-context.test.ts` | 42 | experience-generator-context.test 的单元/集成测试。 |
| `src/test/experience-store-lock.test.ts` | 126 | experience-store-lock.test 的单元/集成测试。 |
| `src/test/failure-pattern-analyzer.test.ts` | 70 | failure-pattern-analyzer.test 的单元/集成测试。 |
| `src/test/fixtures/engine/blocked-python-runner.json` | 26 | blocked-python-runner 的单元/集成测试。 |
| `src/test/fixtures/engine/two-stage-writing.json` | 41 | two-stage-writing 的单元/集成测试。 |
| `src/test/fixtures/webview/ai-controls-element-ids.json` | 14 | ai-controls-element-ids 的单元/集成测试。 |
| `src/test/fixtures/webview/main-panel-element-ids.json` | 81 | main-panel-element-ids 的单元/集成测试。 |
| `src/test/fixtures/webview/task-list-element-ids.json` | 6 | task-list-element-ids 的单元/集成测试。 |
| `src/test/fs-async.test.ts` | 80 | fs-async.test 的单元/集成测试。 |
| `src/test/global-config-confirm-ui.test.ts` | 27 | global-config-confirm-ui.test 的单元/集成测试。 |
| `src/test/global-decision-context.test.ts` | 158 | global-decision-context.test 的单元/集成测试。 |
| `src/test/grill-adaptive-mode-for-stage.test.ts` | 124 | grill-adaptive-mode-for-stage.test 的单元/集成测试。 |
| `src/test/grill-loop.test.ts` | 80 | grill-loop.test 的单元/集成测试。 |
| `src/test/grill-me-section2-ui-contract.test.ts` | 179 | SKILLS-MAPPING.md §2（grill-me → questionBefore / questionAfter）最小回归清单（代码锁） |
| `src/test/hitl-contract-node-policy.test.ts` | 152 | hitl-contract-node-policy.test 的单元/集成测试。 |
| `src/test/impl-output-execution.test.ts` | 32 | impl-output-execution.test 的单元/集成测试。 |
| `src/test/impl-output-guard.test.ts` | 19 | impl-output-guard.test 的单元/集成测试。 |
| `src/test/input-context-policy.test.ts` | 139 | input-context-policy.test 的单元/集成测试。 |
| `src/test/install-vscode-stub.ts` | 30 | node --test 无 VS Code 运行时：在 require('vscode') 前注入轻量桩。 |
| `src/test/instance-session.test.ts` | 69 | instance-session.test 的单元/集成测试。 |
| `src/test/json-extract.test.ts` | 42 | json-extract.test 的单元/集成测试。 |
| `src/test/llm-client.test.ts` | 119 | llm-client.test 的单元/集成测试。 |
| `src/test/llm-invoke-helpers.test.ts` | 119 | llm-invoke-helpers.test 的单元/集成测试。 |
| `src/test/m20-artifact-validation.test.ts` | 99 | m20-artifact-validation.test 的单元/集成测试。 |
| `src/test/m20-quality-chain.test.ts` | 133 | m20-quality-chain.test 的单元/集成测试。 |
| `src/test/m8-decision-conflict-banner.test.ts` | 14 | m8-decision-conflict-banner.test 的单元/集成测试。 |
| `src/test/m8-quality-gate.test.ts` | 14 | m8-quality-gate.test 的单元/集成测试。 |
| `src/test/m8-webview-decision-branches.test.ts` | 78 | m8-webview-decision-branches.test 的单元/集成测试。 |
| `src/test/m8-webview-script-integration.test.ts` | 208 | m8-webview-script-integration.test 的单元/集成测试。 |
| `src/test/manual-retry-limit.test.ts` | 35 | manual-retry-limit.test 的单元/集成测试。 |
| `src/test/module-depth-scorer.test.ts` | 127 | module-depth-scorer.test 的单元/集成测试。 |
| `src/test/openai-compatible-llm.test.ts` | 76 | openai-compatible-llm.test 的单元/集成测试。 |
| `src/test/openai-token-estimate.test.ts` | 55 | openai-token-estimate.test 的单元/集成测试。 |
| `src/test/output-quality-scorer.test.ts` | 106 | output-quality-scorer.test 的单元/集成测试。 |
| `src/test/pause-ui-state.test.ts` | 31 | pause-ui-state.test 的单元/集成测试。 |
| `src/test/plan-completeness-gate.test.ts` | 242 | plan-completeness-gate.test 的单元/集成测试。 |
| `src/test/project-glossary-store.test.ts` | 110 | project-glossary-store.test 的单元/集成测试。 |
| `src/test/prompt-fragments.test.ts` | 39 | prompt-fragments.test 的单元/集成测试。 |
| `src/test/prompt-version-manager.test.ts` | 42 | prompt-version-manager.test 的单元/集成测试。 |
| `src/test/prototype-contract-lint.test.ts` | 116 | prototype-contract-lint.test 的单元/集成测试。 |
| `src/test/quality-gate-registry.test.ts` | 140 | quality-gate-registry.test 的单元/集成测试。 |
| `src/test/question-after-flow.test.ts` | 63 | question-after-flow.test 的单元/集成测试。 |
| `src/test/question-after-integration.test.ts` | 99 | question-after-integration.test 的单元/集成测试。 |
| `src/test/question-after-webview-html.test.ts` | 23 | question-after-webview-html.test 的单元/集成测试。 |
| `src/test/question-before-flow.test.ts` | 32 | question-before-flow.test 的单元/集成测试。 |
| `src/test/question-before-integration.test.ts` | 104 | question-before-integration.test 的单元/集成测试。 |
| `src/test/question-before-normalize-integration.test.ts` | 47 | question-before-normalize-integration.test 的单元/集成测试。 |
| `src/test/question-normalization.test.ts` | 23 | question-normalization.test 的单元/集成测试。 |
| `src/test/red-green-fsm.test.ts` | 97 | red-green-fsm.test 的单元/集成测试。 |
| `src/test/red-green-gate.test.ts` | 163 | red-green-gate.test 的单元/集成测试。 |
| `src/test/refactor-e2e-mock-chain.test.ts` | 99 | refactor-e2e-mock-chain.test 的单元/集成测试。 |
| `src/test/required-answer-validation.test.ts` | 136 | ─── I-8: validateRequiredAnswers 纯函数 ───────────────────────── |
| `src/test/retry-output-policy.test.ts` | 17 | retry-output-policy.test 的单元/集成测试。 |
| `src/test/reuse-strategy.test.ts` | 33 | reuse-strategy.test 的单元/集成测试。 |
| `src/test/rule20-runtime-gate.test.ts` | 143 | Rule20RuntimeGate 纯函数测试 |
| `src/test/rule20-warning-display.test.ts` | 48 | rule20-warning-display.test 的单元/集成测试。 |
| `src/test/sample-header-contract-lint.test.ts` | 81 | 复刻真实失败：create_sample 写 ["ASIN","TK SKU","目标价","库存"]，reader 只认 TK_SKU/目标价格 |
| `src/test/sandbox-executor.test.ts` | 13 | sandbox-executor.test 的单元/集成测试。 |
| `src/test/sdk-path-contract-lint.test.ts` | 162 | sdk-path-contract-lint.test 的单元/集成测试。 |
| `src/test/session-debug-log.test.ts` | 98 | session-debug-log.test 的单元/集成测试。 |
| `src/test/stage-confidence-ui.test.ts` | 102 | stage-confidence-ui.test 的单元/集成测试。 |
| `src/test/stage-error-catalog.test.ts` | 26 | stage-error-catalog.test 的单元/集成测试。 |
| `src/test/stagent-profile-diff.test.ts` | 14 | stagent-profile-diff.test 的单元/集成测试。 |
| `src/test/stagent-settings-governance.test.ts` | 118 | stagent-settings-governance.test 的单元/集成测试。 |
| `src/test/stagent-settings.test.ts` | 33 | stagent-settings.test 的单元/集成测试。 |
| `src/test/static-analysis-pipeline.test.ts` | 91 | static-analysis-pipeline.test 的单元/集成测试。 |
| `src/test/streaming-summary.test.ts` | 202 | StreamingSummary 纯函数 + WorkflowExecutor skip 集成测试 |
| `src/test/task-polish-prompt.test.ts` | 16 | task-polish-prompt.test 的单元/集成测试。 |
| `src/test/task-type-resolution.test.ts` | 62 | task-type-resolution.test 的单元/集成测试。 |
| `src/test/test-quality-lint.test.ts` | 64 | test-quality-lint.test 的单元/集成测试。 |
| `src/test/test-run-command-normalize.test.ts` | 129 | test-run-command-normalize.test 的单元/集成测试。 |
| `src/test/test-run-failure-playbook.test.ts` | 127 | test-run-failure-playbook.test 的单元/集成测试。 |
| `src/test/test-run-preflight.test.ts` | 133 | test-run-preflight.test 的单元/集成测试。 |
| `src/test/ui-visibility.test.ts` | 19 | ui-visibility.test 的单元/集成测试。 |
| `src/test/verify-debug-script.test.ts` | 57 | verify-debug-script.test 的单元/集成测试。 |
| `src/test/verify-rule20-script.test.ts` | 387 | verify-rule20-script.test 的单元/集成测试。 |
| `src/test/webview-bottom-dock-ui.test.ts` | 179 | webview-bottom-dock-ui.test 的单元/集成测试。 |
| `src/test/webview-bundle.test.ts` | 44 | webview-bundle.test 的单元/集成测试。 |
| `src/test/webview-confirm-plan-ui.test.ts` | 64 | webview-confirm-plan-ui.test 的单元/集成测试。 |
| `src/test/webview-confirm-plan.test.ts` | 113 | webview-confirm-plan.test 的单元/集成测试。 |
| `src/test/webview-input-generation-progress.test.ts` | 128 | webview-input-generation-progress.test 的单元/集成测试。 |
| `src/test/webview-input-generation-ui.test.ts` | 39 | webview-input-generation-ui.test 的单元/集成测试。 |
| `src/test/webview-input-hero-layout.test.ts` | 113 | webview-input-hero-layout.test 的单元/集成测试。 |
| `src/test/webview-message-guards.test.ts` | 19 | webview-message-guards.test 的单元/集成测试。 |
| `src/test/webview-script-test-harness.ts` | 544 | Webview 脚本/HTML 契约测试夹具。 |
| `src/test/webview-session.test.ts` | 28 | webview-session.test 的单元/集成测试。 |
| `src/test/webview-template-snapshot.test.ts` | 59 | webview-template-snapshot.test 的单元/集成测试。 |
| `src/test/workflow-artifact-registry.test.ts` | 54 | workflow-artifact-registry.test 的单元/集成测试。 |
| `src/test/workflow-code-runner-host.integration.test.ts` | 47 | workflow-code-runner-host.integration.test 的单元/集成测试。 |
| `src/test/workflow-code-runner-host.test.ts` | 54 | workflow-code-runner-host.test 的单元/集成测试。 |
| `src/test/workflow-complexity-estimator.test.ts` | 22 | workflow-complexity-estimator.test 的单元/集成测试。 |
| `src/test/workflow-dag-graph.test.ts` | 75 | workflow-dag-graph.test 的单元/集成测试。 |
| `src/test/workflow-dag-parallel.test.ts` | 62 | workflow-dag-parallel.test 的单元/集成测试。 |
| `src/test/workflow-disk-bootstrap.test.ts` | 262 | workflow-disk-bootstrap.test 的单元/集成测试。 |
| `src/test/workflow-engine-continuation.test.ts` | 42 | workflow-engine-continuation.test 的单元/集成测试。 |
| `src/test/workflow-engine-dag-recovery.test.ts` | 98 | workflow-engine-dag-recovery.test 的单元/集成测试。 |
| `src/test/workflow-engine-decision-content-lint.test.ts` | 180 | ──────────────────────────────────────────────────────────────── |
| `src/test/workflow-engine-generate.test.ts` | 192 | workflow-engine-generate.test 的单元/集成测试。 |
| `src/test/workflow-engine-integration.test.ts` | 136 | workflow-engine-integration.test 的单元/集成测试。 |
| `src/test/workflow-engine-test-harness.ts` | 191 | WorkflowEngine 集成测试 harness — mock vscode.lm / ExtensionContext / WebviewPanel。 |
| `src/test/workflow-executor-dag.test.ts` | 284 | workflow-executor-dag.test 的单元/集成测试。 |
| `src/test/workflow-executor-file-read-path.test.ts` | 36 | workflow-executor-file-read-path.test 的单元/集成测试。 |
| `src/test/workflow-executor-zoom-out-fallback.test.ts` | 55 | workflow-executor-zoom-out-fallback.test 的单元/集成测试。 |
| `src/test/workflow-experience-store.test.ts` | 174 | workflow-experience-store.test 的单元/集成测试。 |
| `src/test/workflow-failure-log.test.ts` | 77 | workflow-failure-log.test 的单元/集成测试。 |
| `src/test/workflow-generation-orchestrator.test.ts` | 137 | workflow-generation-orchestrator.test 的单元/集成测试。 |
| `src/test/workflow-generation-service.test.ts` | 140 | workflow-generation-service.test 的单元/集成测试。 |
| `src/test/workflow-generation.test.ts` | 144 | workflow-generation.test 的单元/集成测试。 |
| `src/test/workflow-global-arch-auto-insert.test.ts` | 91 | workflow-global-arch-auto-insert.test 的单元/集成测试。 |
| `src/test/workflow-hitl-coordinator.integration.test.ts` | 75 | workflow-hitl-coordinator.integration.test 的单元/集成测试。 |
| `src/test/workflow-input-content.test.ts` | 47 | workflow-input-content.test 的单元/集成测试。 |
| `src/test/workflow-input-resolver.test.ts` | 163 | workflow-input-resolver.test 的单元/集成测试。 |
| `src/test/workflow-instance-bind.test.ts` | 32 | workflow-instance-bind.test 的单元/集成测试。 |
| `src/test/workflow-instance-disk-index.test.ts` | 62 | workflow-instance-disk-index.test 的单元/集成测试。 |
| `src/test/workflow-instance-index.test.ts` | 30 | workflow-instance-index.test 的单元/集成测试。 |
| `src/test/workflow-instance-manager.test.ts` | 179 | workflow-instance-manager.test 的单元/集成测试。 |
| `src/test/workflow-instance-persistence-sync.test.ts` | 48 | workflow-instance-persistence-sync.test 的单元/集成测试。 |
| `src/test/workflow-instance-query.test.ts` | 40 | workflow-instance-query.test 的单元/集成测试。 |
| `src/test/workflow-instance-repository.test.ts` | 140 | workflow-instance-repository.test 的单元/集成测试。 |
| `src/test/workflow-logging.test.ts` | 37 | workflow-logging.test 的单元/集成测试。 |
| `src/test/workflow-parallel-monitor.test.ts` | 14 | workflow-parallel-monitor.test 的单元/集成测试。 |
| `src/test/workflow-path-resolver.test.ts` | 89 | workflow-path-resolver.test 的单元/集成测试。 |
| `src/test/workflow-prompts-auto-mode.test.ts` | 80 | workflow-prompts-auto-mode.test 的单元/集成测试。 |
| `src/test/workflow-prompts-codebase.test.ts` | 13 | workflow-prompts-codebase.test 的单元/集成测试。 |
| `src/test/workflow-prompts-m39.test.ts` | 30 | workflow-prompts-m39.test 的单元/集成测试。 |
| `src/test/workflow-prompts-pvm-integration.test.ts` | 23 | workflow-prompts-pvm-integration.test 的单元/集成测试。 |
| `src/test/workflow-prompts-refactor.test.ts` | 97 | workflow-prompts-refactor.test 的单元/集成测试。 |
| `src/test/workflow-recovery-view-model.test.ts` | 59 | workflow-recovery-view-model.test 的单元/集成测试。 |
| `src/test/workflow-rule20-normalize.test.ts` | 359 | workflow-rule20-normalize.test 的单元/集成测试。 |
| `src/test/workflow-stage-position.test.ts` | 125 | workflow-stage-position.test 的单元/集成测试。 |
| `src/test/workflow-state-envelope.test.ts` | 49 | workflow-state-envelope.test 的单元/集成测试。 |
| `src/test/workflow-state-transitions.test.ts` | 134 | workflow-state-transitions.test 的单元/集成测试。 |
| `src/test/workflow-structural-repair.test.ts` | 123 | workflow-structural-repair.test 的单元/集成测试。 |
| `src/test/workflow-ui-bridge.test.ts` | 89 | workflow-ui-bridge.test 的单元/集成测试。 |
| `src/test/workflow-validation.test.ts` | 362 | workflow-validation.test 的单元/集成测试。 |
| `src/test/write-output-normalize.test.ts` | 98 | write-output-normalize.test 的单元/集成测试。 |
| `src/test/zoom-out-upgrade.test.ts` | 32 | zoom-out-upgrade.test 的单元/集成测试。 |
| `src/TestQualityLint.ts` | 85 | M26：测试质量 lint（借鉴 skills `tdd/tests.md`：测行为而非结构/实现）。 |
| `src/TestRunCommandNormalize.ts` | 172 | M38.2：test_run 命令策略 — 拆分「依赖安装 && 测试执行」复合 command。 |
| `src/TestRunFailurePlaybook.ts` | 249 | M38.3：test_run / code-runner 失败 stderr 分类 → 可读修复 playbook。 |
| `src/TestRunPreflight.ts` | 202 | M38.1：stage_test_run_* 执行前测试栈 preflight（运行期兜底，与 M39.1 生成期门互补）。 |
| `src/uniappPackagePins.ts` | 72 | uni-app（Vue3 + Vite + @dcloudio/vite-plugin-uni）在 npm 上的版本号易被 LLM 幻觉； |
| `src/webview/components/DecisionPauseBar.tsx` | 35 | Preact 试点：决策暂停条底栏按钮区。 |
| `src/webview/components/StageTimeline.tsx` | 58 | Preact：执行页阶段时间线。 |
| `src/webview/decision-pause-bar-entry.tsx` | 18 | Webview 前端（webview）：decision-pause-bar-entry。 |
| `src/webview/runtime/_extracted-bootstrap.js` | 1825 | Webview 内联 bootstrap 构建产物。 |
| `src/webview/runtime/bootstrap.ts` | 111 | Webview 前端（runtime）：bootstrap。 |
| `src/webview/runtime/messages.ts` | 501 | Extension↔Webview 消息类型定义。 |
| `src/webview/runtime/session.ts` | 20 | Webview 前端（runtime）：session。 |
| `src/webview/runtime/shell.ts` | 130 | Webview 前端（runtime）：shell。 |
| `src/webview/runtime/state.ts` | 45 | Webview 主面板共享可变状态。 |
| `src/webview/runtime/view-confirm.ts` | 302 | Webview 前端（runtime）：view-confirm。 |
| `src/webview/runtime/view-exec-dag-graph.ts` | 72 | Webview 前端（runtime）：view-exec-dag-graph。 |
| `src/webview/runtime/view-exec-decision-form.ts` | 493 | Webview 前端（runtime）：view-exec-decision-form。 |
| `src/webview/runtime/view-exec-error-card.ts` | 203 | Webview 前端（runtime）：view-exec-error-card。 |
| `src/webview/runtime/view-exec-output-panel.ts` | 141 | Webview 前端（runtime）：view-exec-output-panel。 |
| `src/webview/runtime/view-exec-stage-list.ts` | 144 | Webview 前端（runtime）：view-exec-stage-list。 |
| `src/webview/runtime/view-exec.ts` | 89 | P1-6：执行视图门面 — 子模块 re-export + reset/register。 |
| `src/webview/runtime/view-input.ts` | 523 | 主面板输入/生成/确认 UI 逻辑。 |
| `src/webview/runtime/vscode-api.ts` | 3 | Webview 前端（runtime）：vscode-api。 |
| `src/webview/shared/escapeHtml.ts` | 9 | HTML 转义（主面板 webview、侧栏 webview 共用）。 |
| `src/webview/shared/formatRelativeTimeZh.ts` | 23 | 任务列表侧栏：相对时间文案。 |
| `src/webview/shims/path-browser.ts` | 18 | 浏览器 webview bundle 用的极简 `path` 子集（替代 Node `path`，供 ArtifactUiHints 等模块 tree-shake 后仍可能引用的路径工具）。 |
| `src/webview/sidebar/ai-controls-entry.ts` | 100 | Webview 前端（sidebar）：ai-controls-entry。 |
| `src/webview/sidebar/task-list-entry.ts` | 115 | Webview 前端（sidebar）：task-list-entry。 |
| `src/webview/stage-timeline-entry.tsx` | 15 | Webview 前端（webview）：stage-timeline-entry。 |
| `src/webview/styles/ai-controls.css` | 124 | Webview 前端（styles）：ai-controls。 |
| `src/webview/styles/main-panel.css` | 184 | Webview 前端（styles）：main-panel。 |
| `src/webview/styles/task-list.css` | 119 | Webview 前端（styles）：task-list。 |
| `src/webview/templates/ai-controls.html` | 60 | Webview 前端（templates）：ai-controls。 |
| `src/webview/templates/main-panel.html` | 178 | Webview 前端（templates）：main-panel。 |
| `src/webview/templates/task-list.html` | 24 | Webview 前端（templates）：task-list。 |
| `src/webview/webview-helpers-entry.ts` | 85 | M36 / #6：Webview 纯函数打包入口（esbuild → `out/webview/webview-helpers.js`）。 |
| `src/webview/webview-main-entry.ts` | 3 | Webview 前端（webview）：webview-main-entry。 |
| `src/webview/webview-shared-entry.ts` | 8 | 侧栏 + 主面板共用的轻量 DOM 工具（esbuild → out/webview/webview-shared.js）。 |
| `src/WebviewConfirmPlanUi.ts` | 130 | 确认页计划审查 UI 纯函数（注入 Webview `<script>`，与 WorkflowArtifactRegistry 路径规则对齐） |
| `src/WebviewCsp.ts` | 35 | 导出 WebviewCspOptions 及相关类型/工具。 |
| `src/WebviewInputGenerationUi.ts` | 29 | 输入页生成/润色进度文案（纯函数，便于单测） |
| `src/WebviewMessageGuards.ts` | 46 | 导出 isFrontendMessage 及相关类型/工具。 |
| `src/WebviewPanel.ts` | 17 | 导出 buildWorkflowWebviewHtml 及相关类型/工具。 |
| `src/WebviewPauseUiState.ts` | 55 | 导出 PauseMode 及相关类型/工具。 |
| `src/WebviewScript.ts` | 34 | 主工作流 Webview 脚本：helpers + shared + 按视图拆分的 runtime（esbuild）。 |
| `src/WebviewStyles.ts` | 5 | 导出 WEBVIEW_STYLES 及相关类型/工具。 |
| `src/WebviewTemplateLoader.ts` | 61 | 导出 loadWebviewAsset 及相关类型/工具。 |
| `src/WebviewUiState.ts` | 11 | 导出 shouldHideOutput 及相关类型/工具。 |
| `src/workflow-templates/uniapp-minimal-template.ts` | 99 | 工作流模板：uniapp-minimal-template。 |
| `src/workflow-templates/web-minimal-template.ts` | 77 | 用户任务是否明显倾向“Web 前端项目”（用于模板化最小工程树约束）。 |
| `src/WorkflowArtifactRegistry.ts` | 73 | 阶段产物注册表。 |
| `src/WorkflowArtifactUi.ts` | 127 | M41：生成物 UI 动作 — openArtifactFile / openArtifactDiff / 调试日志复制与打开。 |
| `src/WorkflowCodeRunnerHost.ts` | 140 | M41：code-runner 执行层 — 从 WorkflowEngine 抽出 shell 执行与 cwd 解析。 |
| `src/WorkflowComplexityEstimator.ts` | 91 | 导出 ComplexityEstimate 及相关类型/工具。 |
| `src/WorkflowDag.ts` | 235 | 阶段依赖 DAG 与 ready 集合。 |
| `src/WorkflowDagGraph.ts` | 205 | 导出 DagGraphNode 及相关类型/工具。 |
| `src/WorkflowDefinition.ts` | 459 | 工作流/阶段/工具/实例核心类型与 JSON 契约。 |
| `src/WorkflowDeletePlan.ts` | 100 | 导出 DeleteScope 及相关类型/工具。 |
| `src/WorkflowDiskBootstrap.ts` | 139 | 导出 STAGE_INIT_NPM_WORKSPACE_ID 及相关类型/工具。 |
| `src/WorkflowDraftShell.ts` | 235 | M41：预执行草稿壳 — 润色/澄清/生成入口的 idle 实例生命周期。 |
| `src/WorkflowEngine.ts` | 818 | WorkflowEngine 编排总线（生成、执行、HITL、持久化）。 |
| `src/WorkflowEngineArtifactBridge.ts` | 28 | 导出 ensureArtifactRegistryForInstance，承担对应领域编排或策略。 |
| `src/WorkflowEngineContinuation.ts` | 27 | 导出 emitStageDoneAdvancePersist 及相关类型/工具。 |
| `src/WorkflowEngineDiagnostics.ts` | 53 | 导出 WorkflowEngineDiagnosticsDeps，承担对应领域编排或策略。 |
| `src/WorkflowEngineExecutionBinder.ts` | 207 | M30-F1：执行循环参数绑定层 — 从 WorkflowEngine 抽出 executeNextStageLoop 入参组装。 |
| `src/WorkflowEngineHelpers.ts` | 78 | 导出 GeneratedWorkflowPreparationResult 及相关类型/工具。 |
| `src/WorkflowEngineHostFactories.ts` | 288 | M41：引擎 Host / Context 工厂 — 集中各 *Host() / *Context() 依赖注入组装。 |
| `src/WorkflowEngineMessaging.ts` | 226 | M41：Webview 消息副作用链 — postMessage 前后的 stageError 日志、experience、artifact hints。 |
| `src/WorkflowEngineOutputHelper.ts` | 15 | 导出 getOrCreateStagentOutputChannel 及相关类型/工具。 |
| `src/WorkflowEnginePathHost.ts` | 154 | M41：引擎路径解析 + patch 落盘 — 从 WorkflowEngine 抽出实例/工作区路径与 applyPatchInstructions。 |
| `src/WorkflowEnginePersistenceBridge.ts` | 62 | 导出 PersistenceBridgeDeps，承担对应领域编排或策略。 |
| `src/WorkflowEngineSettingsReaders.ts` | 128 | M41：引擎 settings 薄读取层 — 集中 vscode 配置读取，便于单测与 Host 工厂注入。 |
| `src/WorkflowEngineWorkspaceLint.ts` | 124 | M41：工作区契约 lint 层 — 从 WorkflowEngine 抽出跨文件 / SDK / 测试质量 lint。 |
| `src/WorkflowExecutor.ts` | 15 | P0-2：WorkflowExecutor 门面 — 类型与执行 API 统一 re-export。 |
| `src/WorkflowExecutorLoop.ts` | 184 | 导出 resolveWorkspaceFirstReadablePath 及相关类型/工具。 |
| `src/WorkflowExecutorTypes.ts` | 106 | 导出 StageStepOutcome 及相关类型/工具。 |
| `src/WorkflowExperienceStore.ts` | 445 | 导出 DEFAULT_MAX_EXPERIENCE_ENTRIES 及相关类型/工具。 |
| `src/WorkflowFailureLog.ts` | 96 | 导出 WorkflowFailureRecord 及相关类型/工具。 |
| `src/WorkflowGeneration.ts` | 262 | M35 / #1：工作流生成链（从 `WorkflowEngine` 抽出 normalize / JSON 解析 / 生成前上下文组装）。 |
| `src/WorkflowGenerationOrchestrator.ts` | 232 | generateWorkflow 管线编排。 |
| `src/WorkflowGenerationRunner.ts` | 413 | M41：工作流生成流水线 — generateWorkflow 主体（LLM 获取/解析 + 校验结果分发）。 |
| `src/WorkflowGenerationService.ts` | 195 | M42：工作流生成服务 — polish / clarify / generate 全链（含 parse / normalize / 序号防覆盖）。 |
| `src/WorkflowHitlCoordinator.ts` | 416 | M41：HITL 动作协调层 — approve / approveDecision / answerQuestions* / retry。 |
| `src/WorkflowInputContent.ts` | 31 | 导出 primaryOutputKey 及相关类型/工具。 |
| `src/WorkflowInputResolver.ts` | 249 | M35 / #1：阶段输入合并与降级（从 `WorkflowEngine.resolveInput` 抽出）。 |
| `src/WorkflowInstanceBind.ts` | 13 | 导出 shouldUseEngineInstanceDespiteStaleWebviewKey，承担对应领域编排或策略。 |
| `src/WorkflowInstanceDiskIndex.ts` | 104 | 导出 listInstanceKeysUnderRoot 及相关类型/工具。 |
| `src/WorkflowInstanceIndex.ts` | 95 | 导出 INSTANCE_INDEX_FILE 及相关类型/工具。 |
| `src/WorkflowInstanceManager.ts` | 265 | M42：实例生命周期管理 — CRUD / save-load / instanceKey / 恢复与草稿壳。 |
| `src/WorkflowInstancePersistenceSync.ts` | 50 | 导出 WF_STATE_FILE_NAME 及相关类型/工具。 |
| `src/WorkflowInstanceQuery.ts` | 79 | 导出 isRecoverableInstance 及相关类型/工具。 |
| `src/WorkflowInstanceRepository.ts` | 435 | M41：实例仓库层 — 从 WorkflowEngine 抽出实例 CRUD、磁盘扫描与 globalState 同步。 |
| `src/WorkflowInstanceResumeCoordinator.ts` | 173 | M41：实例恢复协调层 — resumeInstance / tryActivateInstance / ensureInstanceBound。 |
| `src/WorkflowLogging.ts` | 61 | 导出 sanitizeForLog 及相关类型/工具。 |
| `src/WorkflowNonLlmToolRunner.ts` | 160 | 导出 findStageRuntimeByOutputKey 及相关类型/工具。 |
| `src/WorkflowPanelMessageRouter.ts` | 98 | 导出 routeWorkflowPanelMessage 及相关类型/工具。 |
| `src/WorkflowParallelMonitor.ts` | 73 | 导出 ParallelWaveMetrics 及相关类型/工具。 |
| `src/WorkflowPathResolver.ts` | 162 | 导出 expandUserHomePath 及相关类型/工具。 |
| `src/WorkflowPersistence.ts` | 133 | 任务目录下 `.wf-state.json` 的读写（M12.3：与引擎 `resumeInstance` 配合； |
| `src/WorkflowPlanSummary.ts` | 302 | 计划摘要与阶段边元数据。 |
| `src/WorkflowPreGenerationCoordinator.ts` | 213 | M41：预生成协调层 — polishUserTask / generateClarifyQuestions。 |
| `src/WorkflowProcessDocs.ts` | 115 | 导出 ProcessDoc 及相关类型/工具。 |
| `src/WorkflowPrompts.ts` | 315 | 内置 LLM 提示词拼装。 |
| `src/WorkflowRecoveryViewModel.ts` | 121 | 导出 findFirstFailedStage 及相关类型/工具。 |
| `src/WorkflowRule20Normalize.ts` | 307 | M37 / Rule20 生成后结构归一化（verify 前确定性修补，不改变阶段 id 顺序）。 |
| `src/WorkflowSkipCondition.ts` | 23 | 导出 evaluateSkipCondition 及相关类型/工具。 |
| `src/WorkflowStageErrorHelpers.ts` | 54 | 导出 persistStageLastError 及相关类型/工具。 |
| `src/WorkflowStagePosition.ts` | 82 | 导出 ACTIVE_STAGE_STATUSES 及相关类型/工具。 |
| `src/WorkflowStagePreGates.ts` | 128 | 导出 failWorkflowStageFromGate，承担对应领域编排或策略。 |
| `src/WorkflowStageQuestionGate.ts` | 89 | 导出 handleQuestionBeforeGate，承担对应领域编排或策略。 |
| `src/WorkflowStageStep.ts` | 426 | 导出 executeStageStep 及相关类型/工具。 |
| `src/WorkflowStartCoordinator.ts` | 188 | M41：执行启动协调层 — startExecution 入场 normalize / 实例绑定 / 首阶段调度。 |
| `src/WorkflowStateEnvelope.ts` | 64 | 导出 WF_STATE_SCHEMA_VERSION 及相关类型/工具。 |
| `src/WorkflowStateTransitions.ts` | 104 | 实例/阶段状态迁移与重试规则。 |
| `src/WorkflowStructuralRepair.ts` | 374 | M40.0：生成期计划/门禁后的确定性结构修补（与 normalizeWorkflow / Rule20 归一化同族）。 |
| `src/WorkflowUiBridge.ts` | 66 | M42：Webview UI 桥 — panel 绑定 + postMessage 推送（含副作用链）。 |
| `src/WorkflowValidation.ts` | 128 | 导出 validateGeneratedWorkflow 及相关类型/工具。 |
| `src/WriteOutputNormalize.ts` | 120 | 导出 normalizeLlmOutputForWritePath 及相关类型/工具。 |
| `tsconfig.json` | 26 | 模块 tsconfig（路径 .）。 |

## 2. 超过 500 行（降序）

| 排名 | 路径 | 行数 | 主要职责 |
| ---: | --- | ---: | --- |
| 1 | `src/webview/runtime/_extracted-bootstrap.js` | 1825 | Webview 内联 bootstrap 构建产物。 |
| 2 | `src/WorkflowEngine.ts` | 818 | WorkflowEngine 编排总线（生成、执行、HITL、持久化）。 |
| 3 | `src/generated/PromptFragments.ts` | 554 | 由 prompts/ 构建生成的提示词常量。 |
| 4 | `src/test/webview-script-test-harness.ts` | 544 | Webview 脚本/HTML 契约测试夹具。 |
| 5 | `src/webview/runtime/view-input.ts` | 523 | 主面板输入/生成/确认 UI 逻辑。 |
| 6 | `src/webview/runtime/messages.ts` | 501 | Extension↔Webview 消息类型定义。 |

## 3. 引用 Top 10

| 排名 | 路径 | 被引用次数 | 主要职责 |
| ---: | --- | ---: | --- |
| 1 | `src/WorkflowDefinition.ts` | 185 | 工作流/阶段/工具/实例核心类型与 JSON 契约。 |
| 2 | `src/Rule20Verify.ts` | 18 | Rule20 结构/契约校验（与 CI 同源）。 |
| 3 | `src/WorkflowPrompts.ts` | 15 | 内置 LLM 提示词拼装。 |
| 4 | `src/FsAsync.ts` | 13 | 异步文件读写薄封装。 |
| 5 | `src/webview/runtime/state.ts` | 13 | Webview 主面板共享可变状态。 |
| 6 | `src/test/webview-script-test-harness.ts` | 11 | Webview 脚本/HTML 契约测试夹具。 |
| 7 | `src/ArtifactLifecycleManager.ts` | 9 | 阶段产物状态机与磁盘持久化。 |
| 8 | `src/StagentSettings.ts` | 9 | 设置读取、Profile 与 VS Code 配置桥接。 |
| 9 | `src/WorkflowArtifactRegistry.ts` | 9 | 阶段产物注册表。 |
| 10 | `src/WorkflowDag.ts` | 9 | 阶段依赖 DAG 与 ready 集合。 |

## 4. 循环依赖

### 4.1 双向

| 模块 A | 模块 B |
| --- | --- |
| `src/ArtifactLifecycleManager.ts` | `src/WorkflowDefinition.ts` |
| `src/WorkflowPlanSummary.ts` | `src/WorkflowDefinition.ts` |
| `src/ArtifactUiHints.ts` | `src/WorkflowDefinition.ts` |
| `src/CodeRunnerCommandLint.ts` | `src/CodeRunnerImportLint.ts` |

### 4.2 长环

| 环路 |
| --- |
| `src/WorkflowDefinition.ts` → `src/ArtifactLifecycleManager.ts` → `src/WorkflowStateTransitions.ts` → `src/WorkflowDefinition.ts` |
| `src/WorkflowDefinition.ts` → `src/ArtifactLifecycleManager.ts` → `src/WorkflowStateTransitions.ts` → `src/WorkflowDag.ts` → `src/WorkflowDefinition.ts` |
| `src/QualityGate.ts` → `src/WorkflowGenerationOrchestrator.ts` → `src/QualityGateRunner.ts` → `src/QualityGate.ts` |
