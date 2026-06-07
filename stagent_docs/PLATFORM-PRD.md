# 软件开发工作流平台 PRD

> **Product**: AI 辅助软件开发工作流平台（以下简称「平台」）  
> **来源**: 基于 [WORKFLOW.md](./WORKFLOW.md) §14 扩展  
> **Skill 规范**: [mattpocock/skills](https://github.com/mattpocock/skills)  
> **版本**: v0.1-draft  
> **状态**: Draft

---

## 1. Problem Statement

开发者使用 Matt Pocock Skills 时，需要在 Cursor/Claude 等 Agent 中**手动记忆并串联** `/grill-with-docs` → `/to-prd` → `/to-issues` → `/tdd` 等命令。常见问题：

- 跳过关键阶段（如未 grill 直接 to-prd），导致 PRD 缺决策
- Issue 拆分不符合 vertical slice 规则
- Triage 状态与 slice 依赖关系缺乏可视化
- 多 session 之间 context 断裂，handoff 靠人工
- Setup 配置（issue tracker、triage labels）与具体 feature 工作流脱节

平台将 Matt Pocock Skills 工作流**产品化**：用 **Path Router**（需求 + 仓库快照 → 工作流模板）、结构化 UI、状态机、产物管理和 Agent 编排，引导用户从「几句话需求」走到可交付代码，同时保留每个 Skill 的独立性与可组合性。

路径选型规则与 [WORKFLOW.md §4.1–§4.4](./WORKFLOW.md#41-路径如何划定需求--仓库状态) 对齐。

---

## 2. Solution

平台是一个 **Skill-native 工作流编排系统**，核心能力：

1. **Project 级 Setup Gate** — 绑定 repo、issue tracker、triage 词汇、domain docs 布局
2. **Feature 流水线** — 按 Phase 0–6 编排 Skill 节点，强制执行 Gate 条件
3. **Artifact 中枢** — 管理 `CONTEXT.md`、ADR、PRD issue、slice issue DAG、TDD run、架构 HTML 报告
4. **Issue 状态机** — 同步 triage roles，支持 AFK/HITL slice 调度
5. **Agent 集成层** — 将 UI 操作映射为 `/skill-name` + 参数模板，对接 Cursor 等 Agent

---

## 3. Goals & Non-Goals

### 3.1 Goals (MVP)

| # | Goal |
|---|------|
| G1 | 支持完整 Feature 流水线：Setup → Grill → (Prototype) → PRD → Issues → TDD |
| G2 | 可视化 slice issue 依赖 DAG，按拓扑顺序调度 TDD |
| G3 | 强制执行 Phase Gate（如无 setup 不可 grill，无 grill 不可 to-prd） |
| G4 | 集成 GitHub Issues 作为默认 issue tracker |
| G5 | 展示并编辑 `CONTEXT.md` diff（grill-with-docs 产出） |
| G6 | 支持 `/triage` 横切：issue 看板 + state role 流转 |
| G7 | 导出 Agent prompt（`/skill-name` + context bundle）供 Cursor 执行 |
| G8 | **Path Router**：根据需求特征 + 仓库状态推荐/约束 `workflowTemplate`（见 §6.5） |
| G9 | **决策主旨（Charter）**：用户一次定义决策策略，Agent 在 grill 中按 Charter 代答可预见问题，仅在低置信/高风险时升级（见 §6.6） |

### 3.2 Non-Goals (MVP 不做)

| # | Non-Goal |
|---|----------|
| NG1 | 替代 Cursor/Claude — 平台编排流程，代码执行仍在外部 Agent |
| NG2 | 内置 LLM 推理 — MVP 不自带模型，只做 prompt 组装与 artifact 管理（Charter 自动代答仍由外部 Agent 执行，平台只注入策略、记录 provenance、强制升级闸门） |
| NG3 | 完整 CI/CD — 仅链接外部 PR/check 状态 |
| NG4 | 多租户 SaaS 计费 — MVP 面向单用户/小团队本地或自托管 |
| NG5 | 重写 Skill 逻辑 — 行为以各 `SKILL.md` 为准，平台只做 orchestration |

### 3.3 Future (Post-MVP)

- GitLab / 本地 markdown issue tracker 适配器（Linear 见 §8.1，MVP 已纳入 enum）
- 内置 Agent runtime（Cursor SDK）
- 自动 periodic `/improve-codebase-architecture` 调度
- Team 权限、audit log、Skill 版本 pinning
- Workflow 模板市场（小功能快路径 vs 正式 Feature 全路径）

---

## 4. User Personas

| Persona | 描述 | 核心诉求 |
|---------|------|----------|
| **Solo Dev** | 独立开发者，Cursor + Skills 用户 | 不被流程细节拖累，Gate 防踩坑 |
| **Tech Lead** | 定义架构与 triage 规则 | 控制 label 词汇、审查 PRD/slice 分解 |
| **AFK Agent Operator** | 让 Agent 无人值守 pick up issues | `ready-for-agent` slice 队列 + agent brief |
| **Platform Builder** | 你（本产品开发者） | 可扩展节点、可映射 Skill、数据模型清晰 |

---

## 5. User Stories

### 5.1 Project & Setup

1. As a **Solo Dev**, I want to connect a Git repo and run Setup once, so that all downstream skills know my issue tracker and triage labels.
2. As a **Tech Lead**, I want to map canonical triage roles to my existing GitHub labels, so that `/triage` does not create duplicate labels.
3. As a **Solo Dev**, I want the platform to block Feature creation until Setup is complete, so that I cannot skip Phase 0.

### 5.2 Feature Pipeline

4. As a **Solo Dev**, I want to enter a few sentences of requirements and start a Grill session, so that the Agent asks me one question at a time.
5. As a **Solo Dev**, I want to see `CONTEXT.md` updates inline during grilling, so that shared language is captured as decisions happen.
6. As a **Solo Dev**, I want to optionally run Prototype before PRD, so that I can validate uncertain designs without committing.
7. As a **Solo Dev**, I want to generate a PRD from grilling context and publish it as an issue, so that the plan is durable and linkable.
8. As a **Tech Lead**, I want to review and edit vertical slice breakdown before issues are published, so that granularity and AFK/HITL marks are correct.
9. As a **Solo Dev**, I want the platform to show slice dependencies as a DAG, so that I know which issue to implement next.

### 5.3 Implementation

10. As a **Solo Dev**, I want to launch TDD for a single ready slice issue with one click, so that the Agent receives the correct prompt bundle.
11. As an **AFK Agent Operator**, I want a queue of `ready-for-agent` slices with no open blockers, so that Agents can pick work safely.
12. As a **Solo Dev**, I want to invoke Zoom-out or Diagnose from the TDD panel without breaking the feature workflow, so that on-demand skills remain accessible.

### 5.4 Cross-Cutting

13. As a **Tech Lead**, I want a triage inbox grouped by state role, so that I can process incoming bugs and feature requests.
14. As a **Solo Dev**, I want to generate a handoff document when context is too long, so that a fresh Agent session can continue slice #N.
15. As a **Tech Lead**, I want to schedule architecture reviews and view HTML reports in-platform, so that deepening opportunities are trackable.
16. As a **Solo Dev**, I want the platform to **suggest a workflow path** from my few-sentence requirement and repo state (greenfield vs brownfield, bug vs feature, express vs full), so that I do not have to memorize which skills to chain.

### 5.5 Charter / Auto-Answer

17. As a **Solo Dev**, I want to define a **decision charter** once (prefer / avoid / acceptable / constraints), so that the Agent answers routine grill questions on my behalf and I only decide what the charter cannot cover.
18. As a **Solo Dev**, I want to choose an **auto-answer mode** (`off` / `suggest` / `auto-with-escalation`) per project or feature, so that I control how much the Agent decides for me.
19. As a **Tech Lead**, I want every charter-answered grill decision tagged with its **provenance** (`human` / `charter_direct` / `charter_inferred` / `escalated`), so that I can audit and spot-check inferred answers.
20. As a **Tech Lead**, I want the platform to **force human confirmation** for ADR-worthy / constraint-crossing / low-confidence decisions even when auto-answer is on, so that the Agent never silently answers a high-stakes question wrong.
21. As a **Solo Dev**, I want grill-surfaced decisions to be **fed back into the charter**, so that coverage improves for future features.

---

## 6. Workflow Model

### 6.1 Phase → Node 映射

| Phase | Node ID | Skill | Node Type | 必做 |
|-------|---------|-------|-----------|------|
| 0 | `setup` | `setup-matt-pocock-skills` | SetupGate | 每 repo 一次 |
| 0.5 | `charter` | —（无 skill；手写/半自动生成） | CharterGate（可选，Project 级） | 否（开启自动代答时配置） |
| 1a | `grill-with-docs` | `grill-with-docs` | HumanInTheLoopGate（受 Charter 应答模式调节） | 正式 Feature 推荐 |
| 1b | `grill-me` | `grill-me` | HumanInTheLoopGate（受 Charter 应答模式调节） | 小任务替代 1a |
| 2 | `prototype` | `prototype` | OptionalBranch | 否 |
| 3 | `to-prd` | `to-prd` | DocumentGenerator | 推荐 |
| 4 | `to-issues` | `to-issues` | TaskDecomposer | 多 slice 时 |
| 5 | `tdd` | `tdd` | TDDExecutor | 是（可多次） |
| 5+ | `zoom-out` | `zoom-out` | OnDemandTool | 否 |
| 5+ | `diagnose` | `diagnose` | OnDemandTool | 否 |
| 6 | `arch-review` | `improve-codebase-architecture` | ScheduledReview | 定期 |
| — | `triage` | `triage` | CrossCuttingService | 按需 |
| — | `handoff` | `handoff` | CrossCuttingService | 按需 |

### 6.2 Feature 状态机

```mermaid
stateDiagram-v2
  [*] --> draft: 创建 Feature
  draft --> setup_required: 检测 repo 未 setup
  setup_required --> grilling: Setup 完成
  draft --> grilling: repo 已 setup
  grilling --> prototyping: 用户选择 prototype
  grilling --> prd_pending: 跳过 prototype
  prototyping --> prd_pending: prototype verdict 记录
  prd_pending --> prd_published: to-prd 完成
  prd_pending --> grilling: 发现决策缺口，回退
  prd_published --> slices_drafting: to-issues 草稿
  slices_drafting --> slices_published: 用户批准 breakdown
  slices_published --> implementing: 首个 slice 开始 TDD
  implementing --> implementing: 更多 slice / diagnose / zoom-out
  implementing --> done: 所有 slice 完成 + AC 满足
  done --> [*]
  implementing --> arch_review: 定期或手动触发
  arch_review --> implementing: 可选重构后继续
```

**按 `workflowTemplate` 跳过的状态（摘要）：**

| 模板 | 典型跳过 |
|------|----------|
| `express` | `prd_published`, `slices_*` → 直接 `implementing` |
| `debug` | `prototyping`, `prd_*`, `slices_*`；入口为 `diagnose` |
| `arch_review` | 独立或挂载 `implementing` 后；无 slice DAG |

完整路径目录与 Skill 矩阵见 [WORKFLOW.md §4.2–§4.3](./WORKFLOW.md#42-完整路径目录)。

### 6.3 Phase Gates

| Gate ID | 允许进入 | 条件 | 失败提示 |
|---------|----------|------|----------|
| `CanCreateFeature` | Feature draft | `project.setupStatus == complete` | 「请先完成 Project Setup」 |
| `CanGrill` | Phase 1 | Setup complete | 「Run `/setup-matt-pocock-skills` first」 |
| `CanAutoAnswerGrill` | grill 内自动代答 | `charter` 存在 AND `autoAnswerMode != off`（见 §6.6） | 「未配置 Charter 或自动应答关闭，请人工回答」 |
| `MustEscalateToHuman` | 反向闸门：禁止代答 | 命中 ADR 判据 OR 越过 Charter 约束 OR 置信度 < 阈值 | 「此决策需人工确认（高风险/越界/低置信）」 |
| `CanPrototype` | Phase 2 | `feature.grillingStatus == complete` | 「请先完成需求对齐」 |
| `CanToPrd` | Phase 3 | grilling complete | 「Grill 未完成；to-prd 不会再 interview」 |
| `CanToIssues` | Phase 4 | PRD issue 已发布 | 「请先发布 PRD」 |
| `CanPublishSlices` | Issue 创建 | 用户批准 slice breakdown | 「请确认 slice 粒度与依赖」 |
| `CanTdd` | TDD run | slice.`stateRole == ready-for-agent` AND all blockers closed | 「Issue 未就绪或被阻塞」 |
| `CanExpressTdd` | Express 模板 TDD | setup complete AND grilling complete AND 用户确认单 slice | 见 §6.4 |
| `CanZoomOutBeforeTdd` | Brownfield 动现有模块 | `workflowTemplate` 含 brownfield 且 `touchesUnknownModule` 且本 session 未 zoom-out | 「请先 `/zoom-out`」 |
| `CanDebugEntry` | debug 模板 | `taskIntent == bug` 或 linked bug issue | — |
| `CanArchReview` | Phase 6 / arch_review 模板 | 任意时刻 | — |

### 6.4 快路径（Small Change）

平台应支持 **Express Feature** 模板，跳过 PRD/to-issues：

```
Setup → grill-me → tdd (single run) → done
```

Gate：`CanExpressTdd` = setup complete AND grilling complete AND user confirms single-slice scope.

### 6.5 Path Router（需求 × 仓库状态）

路径**不是**用户手动选的「两条固定路线」，而是由 **需求输入** 与 **仓库快照** 共同决定。规则与 [WORKFLOW.md §4.1–§4.4](./WORKFLOW.md#41-路径如何划定需求--仓库状态) 一致。

#### 6.5.1 输入

| 输入域 | 字段（建议） | 来源 |
|--------|--------------|------|
| **需求** | `initialPrompt`, `taskIntent` | 用户几句话 |
| | `taskIntent` enum | `new_feature` \| `enhancement` \| `bug` \| `refactor` \| `chore` |
| | `estimatedScope` | `single_slice` \| `multi_slice` \| `unknown` |
| | `designUncertainty` | boolean — 是否需要 prototype |
| **仓库** | `isGreenfield` | 无 substantial 代码 / 无 CONTEXT |
| | `setupStatus` | Project.setup |
| | `hasContextMd`, `hasAdrs` | 文件扫描 |
| | `touchesUnknownModule` | 用户/Agent 声明或静态分析 |
| | `hasIssueTrackerRef` | 是否关联 bug issue |

#### 6.5.2 输出：`workflowTemplate`

| 模板 ID | 对应 WORKFLOW 路径 | 默认 Skill 链（摘要） |
|---------|-------------------|----------------------|
| `greenfield_full` | P1 Greenfield 全量 | grill-with-docs → [prototype] → to-prd → to-issues → tdd |
| `brownfield_full` | P2 Brownfield 全量 | grill-with-docs → … → **zoom-out** → tdd |
| `express` | P3 Express | grill-me → tdd |
| `debug` | P4 Bug | triage/diagnose → tdd(回归) → [improve-arch] |
| `arch_review` | P5 架构治理 | improve-codebase-architecture |
| `cross_cutting` | 横切 | triage / handoff / caveman / zoom-out / diagnose（挂载任意模板） |

> 历史别名：`full` → 创建 Feature 时根据 `isGreenfield` 解析为 `greenfield_full` 或 `brownfield_full`。

#### 6.5.3 路由规则（优先级从高到低）

```
1. taskIntent == bug          → debug
2. taskIntent == refactor     → arch_review（或 brownfield_full 若含功能变更）
3. isGreenfield && multi_slice → greenfield_full
4. !isGreenfield && single_slice && !touchesUnknownModule → express
5. !isGreenfield && (multi_slice || touchesUnknownModule) → brownfield_full
6. 默认                       → brownfield_full（保守：对齐现有代码）
```

**升级规则（运行时）：**

| 触发 | 从 → 到 |
|------|---------|
| Express 中 grill 发现跨模块 / schema 变更 | `express` → `brownfield_full` |
| to-prd 前 grilling 不完整 | 任意 → 回 `grilling`，禁止 to-prd |
| diagnose 结论「无 correct seam」 | `debug` → 建议 `arch_review` |
| Brownfield 首次动 Layer 3–4 模块 | 插入 **zoom-out Gate**（`CanZoomOutBeforeTdd`） |

#### 6.5.4 Path Router UI

1. 用户输入几句话需求  
2. 平台扫描 repo（setup、CONTEXT、代码量、是否 linked issue）  
3. 展示 **推荐模板** + 理由（如「已有 checkout 模块 → Brownfield 全量」）  
4. 允许高级用户 **覆盖** 模板（Tech Lead）  
5. 创建 `Feature` 时写入 `workflowTemplate` + `pathRouterReason` JSON  

#### 6.5.5 路径 × Skill 覆盖

完整矩阵见 [WORKFLOW.md §19.1](./WORKFLOW.md#191-路径--skill-覆盖矩阵)。平台 **不应** 假设每条路径启用全部 18 个推广 skill；UI 只展示当前模板 **●/○** 列中的 skill 按钮。

#### 6.5.6 不在 Path Router 内的 Skill

以下 skill **不进入** Feature 主路径自动编排，仅提供独立入口：

| Skill | 原因 |
|-------|------|
| `write-a-skill` | Meta：编写 skill |
| `misc/*` | 一次性工程任务（pre-commit、git guardrails 等） |
| `personal/*`, `deprecated/*`, `in-progress/*` | 未推广或草稿 |

仓库 29 skill 分类见 [WORKFLOW.md §19.2](./WORKFLOW.md#192-仓库-29-skill-分类主路径--专项--未推广)。

### 6.6 Charter（决策主旨 / 自动应答策略）

Charter 是一份**决策策略文件**，让 Agent 在 grill 中按既定原则**代替用户回答**可预见的问题，从而把人工时间从「持续参与整个开发过程」压缩到「前置一次定义 + 几次里程碑确认」。Charter 与 Path Router **正交**：任何 `workflowTemplate` 都可叠加 Charter。规则与 [WORKFLOW.md §5.5](./WORKFLOW.md#55-phase-05决策主旨charter可选) 一致。

> **核心判断**：把 Socratic 对话变成结构化策略，但**不消灭它**——只是把可预见的部分前置、让 Agent 代答。完全用 Charter 关掉 grill（直接 to-prd）会在需求复杂度上升时快速失效。

#### 6.6.1 Charter 结构

四象限 + 升级触发（即决策树骨架）：

| 段 | 含义 | 平台字段 |
|----|------|----------|
| **优先（Prefer）** | 同等条件下倾向的选择 | `prefers[]` |
| **避免（Avoid）** | 默认排除的选择 | `avoids[]` |
| **可接受（Acceptable）** | 明确允许的折中 | `acceptable[]` |
| **约束（Constraints）** | 硬性边界，越界必须升级 | `constraints[]` |
| **升级触发（Escalate）** | 必须问人的条件（ADR 级、沉默、越界、低置信） | `escalationRules[]` |

#### 6.6.2 应答模式（`autoAnswerMode`）

| 模式 | 平台行为 | 默认 |
|------|----------|------|
| `off` | grill 每题等人答（现状）；Charter 仅作背景参考 | ✅ MVP 默认 |
| `suggest` | 平台在 prompt bundle 注入 Charter，Agent 给推荐答案，**人一键确认/改** | |
| `auto-with-escalation` | Agent 自动作答，仅在命中 `MustEscalateToHuman` 时停下问人 | |

应答模式可设在 Project 级（`DecisionCharter.autoAnswerMode`），Feature 级可 override。

#### 6.6.3 答案 Provenance（可追溯）

每条被代答的 grill 决策标注来源，写入 `GrillingSession.messages[].provenance`：

| 值 | 含义 | 审计重点 |
|----|------|----------|
| `human` | 人工回答 | — |
| `charter_direct` | Charter 直接命中 | 低 |
| `charter_inferred` | Agent 由 Charter 插值推导 | **高（最易「自信地答错」）** |
| `escalated` | 命中升级触发，已转人工 | 确认是否漏升级 |

#### 6.6.4 升级与风险闸门

`MustEscalateToHuman` 是**不可被 `auto-with-escalation` 绕过**的反向闸门。命中任一即强制人工：

1. 决策满足 **ADR 判据**（难逆转 + 令人惊讶 + 真实 trade-off）
2. 改动越过 `constraints[]` 边界
3. Agent 置信度 < `escalationPolicy.confidenceThreshold`，或 Charter 沉默/自相矛盾

> **缓解「自信地答错」**：风险闸门 + 里程碑演示确认 + Charter 反馈环，三者缺一不可。

#### 6.6.5 反馈环

grill / arch-review 浮现的、具普适性的决策，session 结束时提示用户**回写进 Charter**（新增 prefer/avoid 或 escalation 规则），提升后续 Feature 覆盖率。平台记录 `DecisionCharter.version` 与变更来源。

#### 6.6.6 Charter UI（摘要）

1. Project 设置页提供 **Charter 编辑器**（四象限 + 升级规则 + 应答模式）
2. 新建 Feature 时可继承 Project Charter 或设 Feature override
3. Grill Panel 中，被代答的问题以**折叠卡**展示，标 provenance badge，`charter_inferred` 高亮提示抽查
4. 升级问题以**普通待答问题**插入 grill 流，照常单问题展示

---

## 7. Data Model

### 7.1 ER 概览

```mermaid
erDiagram
  Project ||--o| SetupConfig : has
  Project ||--o| DecisionCharter : has
  Project ||--o{ Feature : contains
  Project ||--o| ContextDocument : has
  Project ||--o{ Adr : has
  Feature ||--o| DecisionCharter : overrides
  Feature ||--o| GrillingSession : has
  Feature ||--o| PrototypeRun : optional
  Feature ||--o| PrdArtifact : has
  Feature ||--o{ SliceIssue : decomposes
  SliceIssue ||--o{ TddRun : implements
  SliceIssue }o--o{ SliceIssue : blockedBy
  Project ||--o{ TriageIssue : tracks
  Project ||--o{ ArchReviewRun : reviews
```

### 7.2 实体定义

#### Project

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | UUID | 主键 |
| `name` | string | 显示名 |
| `repoPath` | string | 本地或 remote repo 路径 |
| `repoRemoteUrl` | string? | `git remote` URL |
| `setupStatus` | enum | `pending` \| `in_progress` \| `complete` |
| `agentSkillsBlockPath` | string | `AGENTS.md` 或 `CLAUDE.md` |
| `createdAt` | datetime | |

#### SetupConfig

| 字段 | 类型 | 说明 |
|------|------|------|
| `projectId` | UUID | FK |
| `issueTrackerType` | enum | `github` \| `linear` \| `gitlab` \| `local_markdown` \| `other` |
| `issueTrackerConfig` | JSON | owner/repo、CLI 命令模板等 |
| `triageLabelMap` | JSON | canonical role → 实际 label 字符串 |
| `domainLayout` | enum | `single_context` \| `multi_context` |
| `domainDocsPaths` | JSON | `CONTEXT.md`、`docs/adr/` 等路径 |
| `docsAgentsPath` | string | 默认 `docs/agents/` |

#### DecisionCharter

> 见 §6.6。可绑定 Project（全局默认）或 Feature（override）。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | UUID | |
| `scope` | enum | `project` \| `feature` |
| `ownerId` | UUID | FK → Project 或 Feature |
| `prefers` | string[] | 优先项 |
| `avoids` | string[] | 避免项 |
| `acceptable` | string[] | 可接受折中 |
| `constraints` | string[] | 硬性约束（越界必升级） |
| `escalationRules` | string[] | 升级触发条件（ADR 级、沉默、越界、低置信） |
| `autoAnswerMode` | enum | `off` \| `suggest` \| `auto-with-escalation`（默认 `off`） |
| `escalationPolicy` | JSON | `{ confidenceThreshold, forceHumanOnAdr: true, forceHumanOnConstraintCross: true }` |
| `sourcePath` | string? | 如 `docs/agents/charter.md` |
| `version` | int | 反馈环更新计数 |
| `updatedAt` | datetime | |

#### Feature

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | UUID | |
| `projectId` | UUID | FK |
| `title` | string | 功能名 |
| `initialPrompt` | text | 用户最初几句话需求 |
| `taskIntent` | enum | `new_feature` \| `enhancement` \| `bug` \| `refactor` \| `chore` — Path Router 输入，见 §6.5.1 |
| `workflowTemplate` | enum | `greenfield_full` \| `brownfield_full` \| `express` \| `debug` \| `arch_review`（见 §6.5.2）；兼容别名 `full` |
| `pathRouterReason` | JSON | Path Router 推荐理由与命中规则（可展示给用户） |
| `repoSnapshotAtCreate` | JSON | 创建时仓库快照：`isGreenfield`, `hasContextMd`, `hasAdrs`, `touchesUnknownModule` 等 |
| `grillSkill` | enum | `grill-with-docs` \| `grill-me` — 可由模板推导 |
| `autoAnswerMode` | enum? | Feature 级覆盖：`off` \| `suggest` \| `auto-with-escalation`；空则继承 Project Charter（见 §6.6.2） |
| `charterId` | UUID? | 生效的 Charter（Feature override 或 Project 默认） |
| `status` | enum | 见 §6.2 状态机（`debug` / `arch_review` 模板可跳过 PRD/slice 状态） |
| `grillingStatus` | enum | `not_started` \| `in_progress` \| `complete` |
| `templateUpgradedFrom` | enum? | 运行时升级来源（如 `express` → `brownfield_full`） |
| `createdAt` | datetime | |

#### GrillingSession

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | UUID | |
| `featureId` | UUID | FK |
| `skillName` | string | |
| `messages` | JSON[] | Q&A 历史；每条含 `provenance`: `human` \| `charter_direct` \| `charter_inferred` \| `escalated`（见 §6.6.3） |
| `autoAnswerModeUsed` | enum | 本 session 实际生效的应答模式 |
| `escalatedCount` | int | 命中 `MustEscalateToHuman` 转人工的问题数 |
| `charterFeedback` | JSON[] | 建议回写 Charter 的新决策（反馈环，见 §6.6.5） |
| `contextMdSnapshots` | JSON[] | 每次 CONTEXT 更新的 diff |
| `adrsCreated` | string[] | ADR 文件路径 |
| `completedAt` | datetime? | |

#### PrototypeRun

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | UUID | |
| `featureId` | UUID | FK |
| `branch` | enum | `logic` \| `ui` |
| `question` | text | 原型要回答的问题 |
| `verdict` | text | 结论（必存，代码可删） |
| `artifactPaths` | string[] | 原型代码路径（可空） |
| `status` | enum | `running` \| `verdict_recorded` \| `cleaned_up` |

#### PrdArtifact

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | UUID | |
| `featureId` | UUID | FK |
| `issueTrackerRef` | string | 如 `github:owner/repo#100` |
| `bodyMarkdown` | text | PRD 全文 |
| `stateRole` | string | 发布时打的 label（默认 `ready-for-agent`） |
| `publishedAt` | datetime | |

#### SliceIssue

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | UUID | 平台 ID |
| `featureId` | UUID | FK |
| `parentPrdId` | UUID | FK → PrdArtifact |
| `issueTrackerRef` | string | 外部 issue 引用 |
| `title` | string | |
| `sliceType` | enum | `AFK` \| `HITL` |
| `categoryRole` | enum | `bug` \| `enhancement` |
| `stateRole` | enum | 五个 canonical + 映射 |
| `acceptanceCriteria` | string[] | |
| `blockedByIssueIds` | UUID[] | 平台内 DAG |
| `sortOrder` | int | 拓扑序 |
| `status` | enum | `draft` \| `published` \| `in_progress` \| `done` |

#### TddRun

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | UUID | |
| `sliceIssueId` | UUID | FK |
| `agentSessionRef` | string? | 外部 Agent session ID |
| `promptBundle` | text | 发出的完整 prompt |
| `status` | enum | `planning` \| `red` \| `green` \| `refactor` \| `done` \| `blocked` |
| `testsAdded` | string[] | 文件路径 |
| `startedAt` | datetime | |
| `completedAt` | datetime? | |

#### TriageIssue

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | UUID | |
| `projectId` | UUID | FK |
| `issueTrackerRef` | string | |
| `categoryRole` | enum | |
| `stateRole` | enum | |
| `lastTriageAt` | datetime? | |
| `agentBriefPosted` | boolean | |

#### ArchReviewRun

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | UUID | |
| `projectId` | UUID | FK |
| `htmlReportPath` | string | OS temp 或平台托管 URL |
| `candidates` | JSON[] | 报告中的 card 摘要 |
| `selectedCandidateId` | string? | 用户选中 |
| `status` | enum | `report_generated` \| `grilling` \| `done` |
| `scheduledAt` | datetime? | |

---

## 8. Issue Tracker 集成

### 8.1 Adapter 接口 (MVP: GitHub)

```typescript
interface IssueTrackerAdapter {
  createIssue(input: CreateIssueInput): Promise<IssueRef>;
  getIssue(ref: IssueRef): Promise<Issue>;
  updateLabels(ref: IssueRef, labels: string[]): Promise<void>;
  addComment(ref: IssueRef, body: string): Promise<void>;
  closeIssue(ref: IssueRef): Promise<void>;
  listIssues(filter: IssueFilter): Promise<Issue[]>;
}
```

### 8.2 Label 同步规则

- 平台内部使用 **canonical role 名**（`ready-for-agent` 等）
- 读写 issue tracker 时通过 `SetupConfig.triageLabelMap` 转换
- 每个 triaged issue 必须恰好 **1 个 category + 1 个 state** label
- 冲突时阻塞操作，提示 Tech Lead 手动 resolve

### 8.3 PRD / Slice 发布规则

| 类型 | 默认 stateRole | 备注 |
|------|----------------|------|
| PRD | `ready-for-agent` | to-prd skill 行为 |
| Slice (AFK) | `ready-for-agent` | to-issues 默认 |
| Slice (HITL) | `ready-for-human` | 分解时标记 |

---

## 9. Agent 集成层

### 9.1 Prompt Bundle 结构

每次触发 Skill，平台组装：

```markdown
<!-- platform-meta: skill=tdd, featureId=..., sliceIssueId=... -->

/skill-name

[用户可见参数区]

---
## Platform Context Bundle
- Project: ...
- Feature: ...
- Decision Charter (prefer/avoid/acceptable/constraints + escalation rules): ...   # grill 节点专用
- Auto-answer mode: off | suggest | auto-with-escalation                          # grill 节点专用
- CONTEXT.md (excerpt): ...
- Relevant ADRs: ...
- Parent PRD issue: ...
- Slice acceptance criteria: ...
- Prior grilling decisions (summary): ...
```

> **grill 专用指令**：当 `autoAnswerMode != off`，bundle 追加要求 Agent：(1) 对每个问题先查 Charter，能命中则代答并标 `charter_direct`/`charter_inferred`；(2) 命中 ADR 判据 / 越过 constraints / 低置信时**停下问人**（标 `escalated`）；(3) session 末尾汇总建议回写 Charter 的新决策。

### 9.2 触发模式

| 模式 | Skills | 平台行为 |
|------|--------|----------|
| **Manual-only** | `setup-matt-pocock-skills`, `zoom-out` | 仅按钮触发，无自动 suggestion |
| **Guided** | grill, to-prd, to-issues, tdd, triage, prototype, diagnose, arch-review | 按钮 + 自然语言入口，Gate 校验后生成 prompt。**grill 节点额外注入生效 Charter + `autoAnswerMode`**，并要求 Agent 对每个答案回报 provenance、对升级触发停下问人（见 §6.6） |
| **Cross-cutting** | handoff, caveman | 任意阶段可调用，不阻塞主流水线 |

### 9.3 执行模型 (MVP)

1. 平台 **生成 prompt** → 用户 **复制到 Cursor** 或 **deep link**（若 Agent 支持）
2. 用户完成 Agent 会话 → **手动标记阶段完成** 或 **粘贴结果/链接 issue**
3. Post-MVP: Cursor SDK 自动执行 + webhook 回写

### 9.4 Artifact 回写

| Skill | 用户/agent 回写字段 |
|-------|---------------------|
| setup | `SetupConfig` 各字段、`setupStatus=complete` |
| charter | `DecisionCharter` 各字段、`autoAnswerMode`（无外部 skill，平台内编辑） |
| grill-with-docs | `GrillingSession.messages`（含 provenance）、`escalatedCount`、`charterFeedback`、`ContextDocument` diff |
| prototype | `PrototypeRun.verdict` |
| to-prd | `PrdArtifact.issueTrackerRef` |
| to-issues | `SliceIssue[]` + refs |
| tdd | `TddRun.status=done`、关联 PR/commit |
| triage | `TriageIssue.stateRole` |
| arch-review | `ArchReviewRun.htmlReportPath` |

---

## 10. UI 规格

### 10.1 信息架构

```
Dashboard
├── Projects
│   └── [Project Detail]
│       ├── Setup Wizard (Phase 0)
│       ├── Charter Editor (Phase 0.5, 可选)
│       ├── Context & ADRs
│       ├── Features
│       │   └── [Feature Pipeline View]
│       │       ├── Requirements (initial prompt)
│       │       ├── Grill Panel
│       │       ├── Prototype (optional)
│       │       ├── PRD Viewer
│       │       ├── Slice DAG Editor
│       │       ├── TDD Console
│       │       └── Timeline / Activity
│       ├── Issue Board (Triage)
│       └── Architecture Reviews
└── Settings (skills install status, agent connection)
```

### 10.2 核心页面

#### P1: Project Setup Wizard

- **3 步向导**，对应 setup skill 的 Section A/B/C（一次一屏）
- 预览将写入的 `docs/agents/*.md` 和 `## Agent skills` block
- 完成条件：`setupStatus = complete`

#### P1: Path Router（新建 Feature 第一步）

- 输入：几句话 `initialPrompt` + 可选 `taskIntent`
- 自动扫描：`setupStatus`、`CONTEXT.md`、`docs/adr/`、代码量启发式、linked issue
- 输出：**推荐 `workflowTemplate`** + `pathRouterReason`（人类可读）
- 展示 [WORKFLOW §19.1](./WORKFLOW.md#191-路径--skill-覆盖矩阵) 中该模板对应的 Skill 按钮（非全部 18 个）
- Tech Lead 可覆盖模板；覆盖时记录 audit

#### P2: Feature Pipeline View

横向或纵向 **Phase Stepper**，每步显示：

- Gate 状态（🔒 / ✅）
- 主 CTA（「开始 Grill」「生成 PRD」「分解 Issues」）
- 产物摘要（CONTEXT diff 行数、PRD issue #、open slices 数）

- Phase Stepper **按 `workflowTemplate` 隐藏无关步骤**（Express 不显示 PRD/Slice 步）

#### P3: Grill Panel

- 聊天气泡 UI，**强制单问题展示**（与 skill 行为一致）
- 侧边栏：`CONTEXT.md` live diff
- 「完成 Grill」按钮：仅当用户确认无未决分支时可用

#### P4: Slice DAG Editor

- 节点 = slice issue（标题、AFK/HITL badge、state role）
- 边 = `blockedBy`
- 拖拽调整依赖；**校验无环**
- 「批准并发布」→ 调用 adapter 批量 create issues

#### P5: TDD Console

- 下拉选择 **下一个可执行 slice**（自动过滤 blocked / 非 ready-for-agent）
- 显示 acceptance criteria checklist
- 「Launch TDD」→ 生成 prompt bundle
- 子按钮：Zoom-out、Diagnose、Handoff

#### P6: Triage Inbox

三栏 Kanban 或分组列表：

1. Unlabeled
2. `needs-triage`
3. `needs-info`（有 reporter 回复）

点击 issue → Triage 侧栏 → 生成 `/triage` prompt → 回写 state

#### P7: Architecture Report Viewer

- 嵌入或 iframe 打开 HTML 报告
- Candidate card 列表 → 「深入探讨」→ 进入 grilling sub-flow

### 10.3 推荐主流程（按模板）

**默认（greenfield_full / brownfield_full）：**

```
[Path Router] → [Grill] → [可选 Prototype] → [PRD] → [Slice DAG] → [TDD] → [Arch Review]
```

**express：**

```
[Path Router] → grill-me → TDD Console → done
```

**debug：**

```
[Path Router] → Triage/Diagnose → TDD(回归) → [Arch Review 若缺 seam]
```

Path Router 规则见 §6.5；路径 × Skill 见 [WORKFLOW §4](./WORKFLOW.md#41-路径如何划定需求--仓库状态)。

---

## 11. Cross-Cutting Services

### 11.1 Triage Service

- **触发**：Issue Board 任意操作；Feature 内快捷入口
- **规则**：评论必须以 `> *This was generated by AI during triage.*` 开头（平台 prompt 模板内置）
- **与 Feature 关系**：Bug 可能不关联 Feature；Enhancement 可链接到 Feature

### 11.2 Handoff Service

- **触发**：TDD Console、Feature Timeline 的「Session 太长」
- **输入**：`nextFocus`（如「继续 issue #103 TDD」）
- **输出**：temp dir 路径 + suggested skills 列表
- **不重复**：PRD/issue/ADR 只引用路径

### 11.3 Architecture Review Scheduler

- 默认：**每 7 天** reminder（可配置）
- 也可手动触发，scope 可选（whole repo / module path）

---

## 12. API 概要 (REST)

| Method | Path | 说明 |
|--------|------|------|
| POST | `/projects` | 创建 project |
| POST | `/projects/:id/setup` | 保存 setup config |
| GET | `/projects/:id/setup/status` | Gate 查询 |
| PUT | `/projects/:id/charter` | 创建/更新 Project 级 Charter（四象限 + 升级规则 + `autoAnswerMode`） |
| GET | `/projects/:id/charter` | 读取生效 Charter |
| PUT | `/features/:id/charter` | 设置 Feature 级 Charter override |
| POST | `/features/:id/charter/feedback` | 把 grill 浮现的决策回写进 Charter（反馈环） |
| POST | `/projects/:id/features/route` | Path Router：输入 prompt + 可选 intent → 返回推荐 `workflowTemplate` + reason |
| POST | `/projects/:id/features` | 创建 feature（含 template 与 snapshot） |
| PATCH | `/features/:id/status` | 推进状态机 |
| POST | `/features/:id/grill/sessions` | 开始 grill |
| POST | `/features/:id/grill/sessions/:sid/messages` | 追加 Q&A |
| POST | `/features/:id/prototype` | 记录 prototype run |
| POST | `/features/:id/prd/publish` | 触发 to-prd bundle |
| GET | `/features/:id/slices` | 列表 + DAG |
| POST | `/features/:id/slices/publish` | 批准并发布 issues |
| POST | `/slices/:id/tdd/runs` | 启动 TDD |
| GET | `/projects/:id/triage/inbox` | 分诊 inbox |
| POST | `/issues/:ref/triage` | 触发 triage bundle |
| POST | `/projects/:id/arch-reviews` | 触发 arch review |
| POST | `/features/:id/handoff` | 生成 handoff |

---

## 13. MVP Scope & Milestones

### Milestone 1 — Foundation (2–3 weeks)

- [ ] Project + SetupConfig CRUD
- [ ] Setup Wizard（GitHub issue tracker）
- [ ] Gate engine（CanGrill, CanToPrd, CanExpressTdd, CanZoomOutBeforeTdd, …）
- [ ] **Path Router**（§6.5）：repo 扫描 + 模板推荐 API
- [ ] Feature 状态机（draft → grilling → …；按 template 分支）

### Milestone 2 — Plan Pipeline (2–3 weeks)

- [ ] Grill Panel + CONTEXT diff 展示
- [ ] PRD 预览 + GitHub issue 发布（手动回写 ref）
- [ ] Slice DAG Editor（draft only）

### Milestone 3 — Execute (2–3 weeks)

- [ ] Slice 发布到 GitHub
- [ ] TDD Console + prompt bundle
- [ ] Triage Inbox（读 GitHub labels）

### Milestone 4 — Polish (1–2 weeks)

- [ ] Handoff 生成
- [ ] Express workflow 模板
- [ ] Architecture report 路径登记 + 查看器 shell
- [ ] **Charter MVP**：编辑器（四象限 + 升级规则）+ `autoAnswerMode=suggest` + provenance 标注 + `MustEscalateToHuman` 闸门

> **Post-MVP（Charter 进阶）**：`auto-with-escalation` 全自动代答、置信度校准、Charter 反馈环自动回写、覆盖率/误判度量看板。

---

## 14. Success Metrics

| 指标 | 目标 (MVP 后 30 天) |
|------|---------------------|
| Setup 完成率 | > 90% 的 active projects |
| Grill 完成后再 to-prd 比例 | > 95%（Gate 强制） |
| Slice 为 vertical（人工 audit 抽样） | > 80% 合格 |
| Feature 完成率（done 状态） | 较无平台 baseline +20% |
| Path Router 推荐与用户最终模板一致率 | > 85%（抽样）；Express 误推 full < 10% |
| **Charter 覆盖率**（grill 问题被 `charter_direct`/`charter_inferred` 代答的比例） | 实测基线（替代主观「80–90%」猜测），按领域复杂度分桶 |
| **升级精确率**（该升级的决策确实被 `escalated`） | > 95%（漏升级即高风险） |
| **里程碑 misalignment 率**（演示确认时被人发现需返工的代答决策） | < 10%；其中 `charter_inferred` 单独追踪 |

---

## 15. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Agent 执行在平台外，状态不同步 | 高 | 明确「回写」UX；Post-MVP SDK 集成 |
| 用户绕过 Gate 直接去 Cursor | 中 | 文档 + 可选 strict mode；Express 路径合法化小改动 |
| GitHub label 与 canonical role 不一致 | 中 | Setup 强制 mapping；冲突检测 |
| Skill 上游变更 | 中 | Skill 版本 pin；WORKFLOW.md 同步 |
| CONTEXT.md 被写成 spec | 中 | Grill UI 提示 + diff review |
| Path Router 误判模板 | 中 | 展示 reason + 允许 Tech Lead 覆盖；运行时升级 express→full |
| **Charter 过度自信 / 沉默错位**（Agent 从 Charter 插值出看似有据、实则错位的答案，剥夺人类发现 misalignment 的机会） | 高 | `MustEscalateToHuman` 反向闸门强制人工；`charter_inferred` 高亮抽查；里程碑演示确认；默认 `autoAnswerMode=off`/`suggest` |
| **用 Charter 关掉 grill**（复杂需求下退化为「直接 to-prd」反模式） | 中 | Charter 只覆盖可预见决策；grill 仍跑；UI 提示 + 反馈环；强制升级未覆盖问题 |
| **Charter 过时**（一次写死不更新） | 中 | 反馈环提示回写；记录 `version`；定期复审 |

---

## 16. Acceptance Criteria (MVP Release)

1. **AC-1**: 用户可创建 Project，完成 Setup Wizard 后 `CanGrill` gate 打开。
2. **AC-2**: 用户可从几句话创建 Feature，完成 Grill 后才能进入 PRD 步骤。
3. **AC-3**: PRD 可发布为 GitHub issue，平台保存 `issueTrackerRef`。
4. **AC-4**: Slice breakdown 需用户批准后才会 create GitHub issues；DAG 无环。
5. **AC-5**: TDD Console 仅列出 `ready-for-agent` 且无 blocker 的 slices。
6. **AC-6**: 生成的 prompt bundle 包含正确的 `/skill-name` 和 context excerpt。
7. **AC-7**: Triage Inbox 可按 state role 分组展示 GitHub issues。
8. **AC-8**: Express workflow 可在跳过 PRD/issues 的情况下完成 single-slice TDD。
9. **AC-9**: Path Router 根据需求 + 仓库快照推荐 `workflowTemplate`，并展示 reason；用户可覆盖。
10. **AC-10**: Feature Pipeline 按模板隐藏无关 Phase（Express 无 PRD/Slice 步；debug 无 PRD 步）。
11. **AC-11**: 用户可定义 Project 级 Charter（四象限 + 升级规则 + `autoAnswerMode`）；Feature 可 override。
12. **AC-12**: `autoAnswerMode != off` 时，grill prompt bundle 注入 Charter，被代答的决策带 provenance，且命中 ADR 判据/越界/低置信的决策被 `escalated` 转人工而非自动代答。

---

## 17. References

- [WORKFLOW.md](./WORKFLOW.md) — 完整 Skill 工作流；**路径选型 §4.1–§4.4**；**矩阵与 29 skill 分类 §19**
- [SKILLS-MAPPING.md](./SKILLS-MAPPING.md) — Stagent 实现层 systemPrompt 映射（与 SPEC-v3 对齐）
- [mattpocock/skills README](../README.md)
- 各 Skill 定义：`skills/engineering/*/SKILL.md`、`skills/productivity/*/SKILL.md`

---

## 18. Open Questions

| # | Question | Owner | Status |
|---|----------|-------|--------|
| OQ-1 | MVP 是否内置 Git 操作（commit/PR）还是仅链接？ | Product | Open |
| OQ-2 | HTML 架构报告托管在平台还是仅登记 temp path？ | Eng | Open |
| OQ-3 | 是否支持多 Agent 并行 pick up 不同 AFK slices？ | Product | Open |
| OQ-4 | Cursor SDK 集成放在 M2 还是 Post-MVP？ | Eng | Open |

---

*本文档由 [WORKFLOW.md](./WORKFLOW.md) §14 扩展而来。Skill 行为变更时请同步更新 Gate 条件与 Prompt Bundle 模板。*
