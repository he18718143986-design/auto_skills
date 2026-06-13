# Stagent 引擎 · 故障复盘 + 修复方案

> **来源**：一次完整任务运行的调试日志（`workflow-anonymous-chat-app`，trace `4be0860c…`，2026-06-05 21:06 → 06-07 03:48，约 7 小时，64 stage）。
> **定位**：设计/修复规格；对照 [B-ROUTE-SOLUTION.md](./B-ROUTE-SOLUTION.md) 模块分层，见 §3。
> **产品需求**：[STAGENT-PRD.md](./STAGENT-PRD.md)
> **版本**：v0.1-draft

---

## 1. 故障总览

任务最终 `run_end: completed`，但属于「**带病完成**」：核心失败被弱测试 + 强行 approve 放过。真实代价是 4 个底层 bug 叠加，被「自执行 + 实时重试」放大成 ~7 小时的重试风暴（大量 `retry` / `retry_rejected` / `run_resume failed`）。

| 症状（日志事件） | 命中 stage | 根因编号 |
|------------------|------------|----------|
| `code-runner exitCode=127` | `stage_init_npm_workspace`（`npm init -y`）、`stage_test_run_chat_ui`/`call_ui`（`flutter test`） | **R1** |
| `invariant-violation: test-run-preflight（M38.1）缺少测试基础设施` | `stage_test_run_chat_integration` | **R2** |
| `llm-invalid-output` / `write_output_integrity_mismatch` | `stage_impl_docker`、`stage_impl_voice_message_ui`、`stage_impl_call_ui_call_button` | **R3** |
| `test-run-contract-lint M39.2 test-import-path-not-in-plan` + `M38.3 jest-module-not-found` | `stage_test_run_chat_integration`、`stage_test_run_voice_message_integration` | **R4** |
| `red-green-pre-impl: test GREEN before impl`、最终弱测试通过 | `stage_impl_voice_message_ui` 等 | 见 §2.5 |

---

## 2. 根因分析与修复规格

### R1 · code-runner `exitCode=127`（PATH 缺失）— 最致命

**证据**
- 首个执行阶段 `stage_init_npm_workspace`（`npm init -y`）首跑即 127；14 分钟后手动 retry 却成功。
- `flutter test` 长期 127，直到后期才转为 69 / done。
- 同期 `cd server && npm test` 是 exitCode=1（npm 找得到）——说明是 **PATH 不稳定/不完整**，而非 npm 真缺失。

**判定**：macOS 下 GUI 启动的 VS Code 不继承登录 shell 的 PATH，code-runner 派生的非登录、非交互 shell 找不到 `npm`/`flutter`（127 = command not found）。

**涉及模块**：`out/StageCodeRunnerService.js`、`out/CodeRunnerInvokeHelpers.js`（命令派生处）。

**修复规格**
1. code-runner 统一通过登录 shell 执行：`${SHELL:-/bin/zsh} -lc "<command>"`（zsh 用 `-l`，bash 用 `-lc`），使其 source `~/.zprofile`/`~/.zshrc`，拿到用户 PATH。
2. 启动时做一次「工具探测」：解析 `node/npm/npx/flutter` 绝对路径（`command -v` via 登录 shell），缓存并注入子进程 `env.PATH`。
3. 127 专属 playbook：错误信息直指「命令未找到 / PATH」，给「在登录 shell 重试」一键动作，**不要**走通用 retry（通用 retry 对 127 无意义，只会刷次数）。

**验收**：在 GUI 启动的 VS Code 中，`npm init -y` / `flutter test` 首跑不再 127。

---

### R2 · test-run-preflight（M38.1）误报 — 扫错目录

**证据**：21:22 已写 `server/jest.config.js`、`server/tsconfig.json`；21:50 `stage_test_run_chat_integration`（命令 `cd server && npm test`）仍报「工作区缺少 jest.config.*/tsconfig.json」并阻断。

**判定**：preflight 在 **workspace 根**扫配置，未理会命令里的 `cd server`，monorepo 子目录配置被漏判。

**涉及模块**：`out/TestRunPreflight.js`。

**修复规格**
1. 从命令解析有效工作目录：优先 `toolConfig.workingDir`，再解析命令前缀 `cd <dir> && ...`，得到 `effectiveCwd`。
2. 在 `effectiveCwd` 及其向上若干层（monorepo 根）查找 `jest.config.*` / `babel.config.*` / `tsconfig.json` / `package.json(test script)`。
3. 找不到时，报错带上「实际扫描路径」，便于定位，而非笼统「工作区缺少」。

**验收**：`cd server && npm test` 在 `server/jest.config.js` 存在时 preflight 通过。

---

### R3 · writeOutputToFile 抽取失败 → `llm-invalid-output` / `write_output_integrity_mismatch`

**证据**
- `stage_impl_docker`：raw=6180→written=1440、raw=5425→1122、raw=3949→0、raw=5668→945、raw=3427→0，连环 `llm-invalid-output`；最终只写 772 字、置信度 **0.19 critical** 被强行 approve。
- `stage_impl_voice_message_ui`：raw=21450→written=251、raw=32261→written=2159。
- `stage_impl_call_ui_call_button`：raw=7166→written=73（首次），retry 后 raw=11764→11752 才正常。

**双重根因**
- **(a) 抽取器脆弱**：LLM 用「散文 + 多个代码围栏」包裹（`以下是…` + ```` ```dockerfile ```` + ```` ```yaml docker-compose ````）。抽取器取首块/取偏；遇大写 ` ```Dockerfile ` 或缩进围栏（`    FROM node…`）直接抽出 0 字。
- **(b) 单阶段多文件**：`stage_impl_docker` 一个阶段要同时产 `server/Dockerfile` + `docker-compose.yml`，违反单文件落盘（M40）。生成侧没拦住，LLM 必然吐两块 → 抽取必乱。

**涉及模块**：`out/WorkflowEngineOutputEdit.js`（抽取 + integrity 校验）、生成侧 `WorkflowComplexityEstimator` / `generated/PromptFragments.js`（单文件约束）。

**修复规格**
1. **抽取器加固**：去前导散文；围栏语言大小写不敏感、容缩进；当有多个围栏时，按**目标文件扩展名**匹配并选**最大**块；无围栏时回退为「去掉首尾解释段的正文」。
2. **integrity 守卫 + 自动重述**：当 `written << raw`（如 <50% 或 =0），不直接判失败刷 retry，而是先用加固抽取重试一次；仍不行才升级人工，并把「raw 全文」附在错误里供人工救回。
3. **生成侧强制单文件**：impl 阶段 `writeOutputToFile` 只允许一个文件；docker 这类必须拆 `stage_impl_dockerfile` → `server/Dockerfile`、`stage_impl_docker_compose` → `docker-compose.yml`（PromptFragments 已有该约束，需在校验侧 **硬拦**而非软警告）。

**验收**：docker / 多文件场景被拆成单文件阶段；抽取器对「散文+围栏」「大写/缩进围栏」稳定取全文。

---

### R4 · M39.2 测试 import 路径与产物/技术栈不符

**证据**：`chat_integration.test.ts` import `../src/app`、`voice_message_integration.test.ts` import `../src/app.module` + `@nestjs/testing`；但决策选 **Express**、入口是 `src/index.ts`。`test-run-contract-lint` 全程只「警告」不阻断 → 测试 exitCode=1 反复失败，并触发 `M38.3 jest-module-not-found(@nestjs/testing)`。

**判定**：test-write 阶段没拿到 artifact registry 的真实落盘路径与 DecisionRecord 技术栈，LLM 凭习惯写出 NestJS 风格 import；contract-lint 发现了不一致却不闭环。

**涉及模块**：`out/CodeRunnerImportLint.js`（M39.2）、test-write 提示 `WorkflowPrompts.js`。

**修复规格**
1. test-write 的 systemPrompt 注入：本工作流已登记的 **artifact 落盘路径清单** + DecisionRecord 的技术栈（Express，非 NestJS），并明确「import 路径必须命中清单」。
2. contract-lint 命中 `test-import-path-not-in-plan` 时，让 **test-write 阶段失败重写**（带 lint 反馈），而不是仅警告后放行到 test_run。
3. 与 R2 联动：test_run 前置校验依赖装好（`@nestjs/testing` 这类应在 preflight/依赖装阶段拦截）。

**验收**：生成的测试 import 仅引用已登记产物路径；技术栈与决策一致；contract-lint 命中即阻断重写。

---

### 2.5 衍生问题（不单列根因，但引擎需覆盖）

- **弱测试通过**：`red-green-pre-impl`（impl 前测试就 GREEN）说明部分测试是空壳。`RedGreenGate` 应在 impl 前要求配对测试为 RED（真失败），否则判无效。
- **重试风暴**：R1–R4 未被自动修复，导致 `retry`/`retry_rejected`/`run_resume failed` 反复刷，耗时 7 小时。根因修好后，配合「决策前置 + 失败 playbook 精准化」可消除空转。

---

## 3. 并入引擎改造

把 4 个修复挂到 [B-ROUTE-SOLUTION.md](./B-ROUTE-SOLUTION.md) 的层与里程碑上，作为「能跑通一次完整任务」的前提。

| 根因 | 引擎位置 | 动作 |
|------|-------------------|------|
| **R1 PATH** | §3 架构 ④ 工具层（`StageCodeRunnerService`） | 工具层增加「登录 shell 执行 + 工具路径探测」；127 专属 playbook |
| **R2 preflight** | §8 质量门 / ④ 工具层（`TestRunPreflight`） | preflight 解析 effectiveCwd，支持 monorepo |
| **R3 落盘抽取** | §5.1 数据契约 + ④ 工具层（`WorkflowEngineOutputEdit`）+ 生成侧 | 抽取器加固 + integrity 自动重述 + 生成侧强制单文件 |
| **R4 测试一致性** | §6 DecisionRecord 注入 + §8 质量门（`CodeRunnerImportLint`） | 把产物路径/技术栈注入 test-write；lint 命中即重写 |
| 弱测试 / 重试风暴 | §7 实时 HITL + §11 决策前置 | RedGreenGate 强约束 RED；决策前置减少打断；playbook 精准化 |

**并入 roadmap（更新 §12.3）**：这 4 个修复构成 **B-R0「固化引擎」** 的硬退出条件——
> B-R0 退出标准（修订）：在 GUI 启动的 VS Code 中，一条 `software`（含 monorepo server/ + mobile/）任务能端到端跑通，**不出现 R1–R4**；测试为真 RED→GREEN（非空壳）。

**为什么修复要并入而非旁路**：R1–R4 都是「自执行链路」上的工具层/质量门缺陷。B 路线的卖点是「引擎自动跑、把关拦得住」——若工具层不稳（127）、落盘不稳（抽取失败）、把关只警告不闭环（R2/R4），则「自执行」反而把错误放大。**先把这层稳住，决策前置/实时把关才有意义。**

---

## 4. 实施顺序与依赖

```
R1 (PATH)  ──┐  无前置，最高优先（不修则首个 exec 阶段就挂）
R3 (落盘)  ──┤  无前置，与 R1 并行
R2 (preflight) ─ 依赖能跑命令（R1）
R4 (测试一致性) ─ 依赖 R2/R3（先能落盘、能跑测试，再谈 import 一致）
弱测试/重试风暴 ─ 依赖 R1–R4 + 决策前置（§11）
```

建议批次：**批次一** R1 + R3（让一次任务能落盘、能执行）；**批次二** R2 + R4（让测试真正可信）；**批次三** 决策前置 + RedGreenGate 强约束（消除空转、堵住弱测试）。

---

## 5. 待源码接入后的落地清单（checklist）

- [ ] 定位真实 TS 源（对应 `out/StageCodeRunnerService.js` / `CodeRunnerInvokeHelpers.js` / `TestRunPreflight.js` / `WorkflowEngineOutputEdit.js` / `CodeRunnerImportLint.js` / `WorkflowPrompts.js` / `generated/PromptFragments.js`）。
- [ ] R1：登录 shell 执行 + 工具路径探测 + 127 playbook + 单测（PATH 注入、127 分类）。
- [ ] R2：effectiveCwd 解析 + monorepo 扫描 + 单测（`cd server && npm test` 命中 server 配置）。
- [ ] R3：抽取器加固 + integrity 自动重述 + 生成侧单文件硬拦 + 单测（散文/大写/缩进围栏、多文件拆分）。
- [ ] R4：test-write 注入产物路径/技术栈 + contract-lint 命中重写 + 单测（Express vs NestJS import 一致性）。
- [ ] RedGreenGate：impl 前要求配对测试 RED + 单测。
- [ ] 回归：用本次「匿名聊天 app」同一需求重跑，验证 R1–R4 不复现、测试真 RED→GREEN。

---

*本文档基于真实运行日志编写；模块名对照 `stagent_vscode/out/`。源码接入后请按 §5 落地，并据实回填 §3 与 [B-ROUTE-SOLUTION.md](./B-ROUTE-SOLUTION.md) §12.3。*
