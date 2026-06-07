import {
  webUserIntentHint,
  WEB_PACKAGE_JSON_IMPL_SYSTEM_PROMPT,
  WEB_MINIMAL_PROJECT_TEMPLATE_TEXT,
} from './workflow-templates/web-minimal-template';
import {
  uniappUserIntentHint,
  UNIAPP_PACKAGE_JSON_IMPL_SYSTEM_PROMPT,
  UNIAPP_MINIMAL_PROJECT_TEMPLATE_TEXT,
} from './workflow-templates/uniapp-minimal-template';
import { isAutoTaskType } from './TaskTypeResolution';
import { LOG_PREVIEW_MEDIUM } from './LogPreviewLimits';
import { userHintsMultiModuleOrFullProject } from './workflow/MultiModuleUserInputHints';
import {
  ARTIFACT_INPUT_ALIGNMENT_TEXT,
  DEBUG_CONSTRAINT_TEXT,
  DECISION_RECORD_STRICT_SUFFIX,
  ENGINEERING_TEST_STRATEGY_BORROWING_TEXT,
  GENERATOR_JSON_SCHEMA_BASE,
  getPromptFragmentSlotSeeds,
  IMPROVE_ARCHITECTURE_CONSTRAINT_TEXT,
  LAYER_1_TO_5_TEXT,
  MAIN_ASSEMBLY_NAMING_TEXT,
  PROTOTYPE_CONSTRAINT_TEXT,
  PYTHON_CODE_RUNNER_CONSTRAINT_TEXT,
  REFACTOR_CONSTRAINT_TEXT,
  RULE20_SYSTEM_PROMPT_TEXT,
  SPEC_75_ORIGINAL_TEXT,
  SPEC_78_MULTI_MODULE_TEXT,
  TASK_TYPE_CLASSIFICATION_TEXT,
  TEST_INFRASTRUCTURE_BEFORE_TEST_RUN_TEXT,
  VERTICAL_SLICE_CONSTRAINT_TEXT,
} from './generated/PromptFragments';

export {
  webUserIntentHint,
  WEB_PACKAGE_JSON_IMPL_SYSTEM_PROMPT,
  uniappUserIntentHint,
  UNIAPP_PACKAGE_JSON_IMPL_SYSTEM_PROMPT,
  ARTIFACT_INPUT_ALIGNMENT_TEXT,
  MAIN_ASSEMBLY_NAMING_TEXT,
  PYTHON_CODE_RUNNER_CONSTRAINT_TEXT,
  TEST_INFRASTRUCTURE_BEFORE_TEST_RUN_TEXT,
};

/** 用户 meta.userInput 是否显式倾向「完整项目 / 多模块 / 全栈」（与 SPEC §7.8.2 条件 2 对齐，供生成提示与测试）。 */
export function multiModuleUserIntentHint(userInput: string | undefined): boolean {
  if (!userInput?.trim()) {
    return false;
  }
  return userHintsMultiModuleOrFullProject(userInput);
}

export function safeSnippet(text: string, max = LOG_PREVIEW_MEDIUM): string {
  return text.length <= max ? text : `${text.slice(0, max)}...`;
}

export function looksLikeRefusal(text: string): boolean {
  const t = text.trim().toLowerCase();
  return (
    t.includes("sorry, i can't assist with that") ||
    t.includes('i cannot assist with that') ||
    t.includes("i can't assist with that") ||
    t.includes('无法协助') ||
    t.includes('无法帮助')
  );
}

export function ensureDecisionPromptStrict(base: string): string {
  const cleaned = base
    .split(DECISION_RECORD_STRICT_SUFFIX)
    .join('')
    .split(SPEC_75_ORIGINAL_TEXT)
    .join('')
    .trim();

  const withDecisionLead =
    cleaned.includes('### 职责边界') || cleaned.includes('DecisionRecord')
      ? cleaned
      : `${cleaned}\n\n请先完成“决策清单（DecisionRecord）”，再进入实现。`;

  // Rule 20-F：每个决策阶段都必须追加 SPEC §7.5 原文（强制、不得省略）。
  return `${withDecisionLead}\n${DECISION_RECORD_STRICT_SUFFIX}\n${SPEC_75_ORIGINAL_TEXT}`;
}

export interface WorkflowGeneratorContext {
  /** 与即将写入 meta.userInput 的文本一致，用于 §7.8 关键词提示 */
  userInput?: string;
  /** M16.1：经 token 预算裁剪后的代码库快照文本 */
  codebaseContext?: string;
  /** M17.6：经验库 few-shot（灰度；不得注入决策阶段合同块） */
  experienceFewShot?: string;
  /** M18.1：PromptVersionManager 槽位覆盖（缺省回退 prompts/*.md 构建 seed） */
  promptSlots?: Partial<Record<ManagedPromptSlotName, string>>;
  /** M34 / #13：已有 ADR 摘要，避免生成器重复 litigate 已决架构决策 */
  adrContext?: string;
}

export type ManagedPromptSlotName =
  | 'RULE20_SYSTEM_PROMPT'
  | 'DECISION_RECORD_STRICT_SUFFIX'
  | 'SPEC_75_ORIGINAL_TEXT'
  | 'VERTICAL_SLICE_CONSTRAINT';

function resolvePromptSlot(
  ctx: WorkflowGeneratorContext | undefined,
  slot: ManagedPromptSlotName,
  fallback: string,
): string {
  const override = ctx?.promptSlots?.[slot]?.trim();
  return override && override.length > 0 ? override : fallback;
}

/** M16.4 PromptVersionManager 初始 seed；DECISION / §7.5 块标记 protected。 */
export function getManagedPromptSeeds(): Record<string, { content: string; protected: boolean }> {
  return getPromptFragmentSlotSeeds();
}

function appendCodebaseContextBlock(base: string, ctx?: WorkflowGeneratorContext): string {
  const parts: string[] = [base];
  const block = ctx?.codebaseContext?.trim();
  if (block) {
    parts.push(`\n\n【工作区代码库快照（仅供参考，勿当作用户任务原文）】\n${block}`);
  }
  const exp = ctx?.experienceFewShot?.trim();
  if (exp) {
    parts.push(`\n\n${exp}`);
  }
  const adr = ctx?.adrContext?.trim();
  if (adr) {
    parts.push(`\n\n${adr}`);
  }
  return parts.join('');
}

function buildSoftwareGeneratorAppendix(ctx?: WorkflowGeneratorContext): string {
  const emphasis =
    ctx?.userInput && multiModuleUserIntentHint(ctx.userInput)
      ? `

【.payload 提示】当前「用户任务」文本命中 §7.8 多模块/完整项目关键词：你必须插入全局架构决策阶段（推荐 stage_decide_architecture_overview），并放在首个切片 stage_decide_<语义> 之前；DecisionRecord 须含模块边界表、模块间接口合约、50 阶段预算与超限削减建议。`
      : '';

  const userIn = ctx?.userInput?.trim();
  const uniappHint = !!(userIn && uniappUserIntentHint(userIn));
  const webMinimalHint = !!(userIn && webUserIntentHint(userIn) && !uniappHint);

  const rule20Text = resolvePromptSlot(ctx, 'RULE20_SYSTEM_PROMPT', RULE20_SYSTEM_PROMPT_TEXT);
  const verticalSliceText = resolvePromptSlot(ctx, 'VERTICAL_SLICE_CONSTRAINT', VERTICAL_SLICE_CONSTRAINT_TEXT);

  return `${rule20Text}

${verticalSliceText}

${uniappHint ? UNIAPP_MINIMAL_PROJECT_TEMPLATE_TEXT : ''}
${webMinimalHint ? WEB_MINIMAL_PROJECT_TEMPLATE_TEXT : ''}

${SPEC_78_MULTI_MODULE_TEXT}

${LAYER_1_TO_5_TEXT}

${ENGINEERING_TEST_STRATEGY_BORROWING_TEXT}

${MAIN_ASSEMBLY_NAMING_TEXT}

${TEST_INFRASTRUCTURE_BEFORE_TEST_RUN_TEXT}

补充要求（software）：
- 决策阶段 systemPrompt 采用三层构成：§7.5 原文 + grill-with-docs 补充层 + §4.4 输出约束；
- grill-with-docs 至少强制注入 Challenge terminology；
- 仅在架构级不可逆决策时启用 ADR 条件；
- 若 meta.isGreenfield !== true，先插入 stage_zoom_out(file-read) 产出 moduleMap，再由 decide_X/impl_X 消费。
- **落盘与可执行性（Rule 20-I）**：用户应将「工作文件夹」指向已或即将作为 npm 子项目的目录；每个 stage_impl_* 必须输出完整可保存的实现；stage_test_run_* 的 code-runner 应在该子项目根执行 npm test / npm run test。
- **入口装配（M27.1）**：≥3 个代码落盘模块时须含可检测的入口（stage_impl_* 含 main/app/server/index/runner、或 writeOutputToFile 为 index.ts/App.tsx、或 code-runner 执行 npm start / npx expo start）；禁止仅靠 stage_impl_integration 或纯 jest 集成测试。
- **测试基础设施（M39.1）**：含 jest/npm test 的 stage_test_run_* 或 .ts/.tsx 验证时，首个 test_run **之前**须有 stage_impl_* 落盘 jest.config.*（Expo/RN 还须 babel.config.*），路径与 test_run 的 cd/workingDir 一致；否则确认页 plan_incomplete 阻断。
- **单文件落盘（M40）**：每个 writeOutputToFile 阶段只生成**一个**磁盘文件。禁止在单个 stage 的 systemPrompt 中要求同时输出 Dockerfile 与 docker-compose.yml、或任意两个路径。多文件须拆成多个 stage_impl_*（如 stage_impl_dockerfile → server/Dockerfile，stage_impl_docker_compose → docker-compose.yml）。每个 impl 的 systemPrompt 须要求**纯文件正文**（禁止 Markdown 标题、说明、代码围栏）。
- **测试栈对齐**：server 为 Express 时，stage_test_write_* 禁止 import @nestjs/*；测试须与 package.json 依赖及 DecisionRecord 技术栈一致。
- **测试 import 路径（M39.3）**：stage_test_write_* 的 systemPrompt 须写明将被 import 的相对路径（如 from '../src/index'），且路径必须对应本工作流中已有 stage 的 writeOutputToFile 落盘路径；禁止示例 import ../src/app 除非计划中确有 server/src/app.ts 等对应 stage。${emphasis}`;
}

function buildUnifiedAutoTaskTypePrompt(ctx?: WorkflowGeneratorContext): string {
  return appendCodebaseContextBlock(
    `${GENERATOR_JSON_SCHEMA_BASE}

${TASK_TYPE_CLASSIFICATION_TEXT}

===== 类型约束：software（仅当 meta.taskType=software） =====
${buildSoftwareGeneratorAppendix(ctx)}

===== 类型约束：refactor（仅当 meta.taskType=refactor） =====
${REFACTOR_CONSTRAINT_TEXT}

补充要求（refactor）：
- 架构决策阶段同样遵循三层构成：§7.5 原文 + grill-with-docs 补充层 + §4.4 输出约束；
- 必须显式给出“行为等价”验证路径（test_run 或 code-runner）；
- 若 meta.isGreenfield !== true，优先插入 stage_zoom_out(file-read) 产出 moduleMap，再由 decide/impl 消费。

===== 类型约束：improve-architecture（仅当 meta.taskType=improve-architecture） =====
${IMPROVE_ARCHITECTURE_CONSTRAINT_TEXT}

补充要求（improve-architecture）：
- stage_zoom_out 须产出模块地图（可 llm-text + CONTEXT 词汇表；file-read 为 fallback）；
- 决策阶段列出 deletion-test 候选与 seam，禁止跳过验证链的大改；
- 与 refactor 相同：external behavior 等价 + 每切片 test/impl/test 或等价 code-runner。

===== 类型约束：debug（仅当 meta.taskType=debug） =====
${DEBUG_CONSTRAINT_TEXT}

补充要求（debug）：
- 优先 AFK 链路，尽量使用可执行阶段表达复现与回归验证；
- 若必须 HITL，需在阶段描述中写明无法自动化的原因；
- 若复现/验证涉及 Python 脚本或 pip 依赖，code-runner 须遵守 PYTHON INFRA（见 prototype 约束块中的 venv + python3 -m pip 规则）。

===== 类型约束：prototype（仅当 meta.taskType=prototype） =====
${PROTOTYPE_CONSTRAINT_TEXT}

${TEST_INFRASTRUCTURE_BEFORE_TEST_RUN_TEXT}

补充要求（prototype）：
- 优先最小可运行演示（MVP）而非完整功能面；
- 每个关键假设都应对应一个可观测验证信号；
- Python 多文件项目：**每个文件单独 writeOutputToFile 阶段**，禁止 setup_project.py 一次性生成全仓库；
- Excel 样本：create_sample 与所有 stage_test_run_* 必须使用同一 input.xlsx 路径与 ASIN/SKU/TargetPrice/Stock 列名；
- Python 验证阶段 MUST 使用 python3 -m venv .venv + .venv/bin/python -m pip（禁止 pip install && python 裸命令）。
- 交付闭环（硬性，见 ARTIFACT 对齐规则 11）：任务声明了输出文件（CSV/报告/导出）时，必须包含 writer 产出阶段 + main 入口阶段 + 末尾端到端集成阶段（跑 main 并断言产物存在/行数/必需列名）；不得止步于 analyzer 等中间模块。
- 验证覆盖（硬性，见规则 12）：最后一个核心模块也必须有 code-runner check；且至少一个 check 为跨模块集成（用上游真实输出喂下游），以暴露字段名/容器类型/模块名契约错位。
- 数据契约（硬性，见规则 13）：决策记录必须含 DATA_SCHEMA，钉死每个跨模块 dict 的字段名+类型+枚举（含「成功」枚举字面量，如 query_status=="success"）；reader/fetcher/analyzer/writer/mock_data 全部复用同一组键名，禁止 availability/stock_status、sku/tk_sku、success/OK 漂移。
- 共享样例源（硬性，见规则 14）：create_sample 与 mock_data 必须共享同一 ASIN/SKU 列表；mock_data 阶段 input.sources 须引用 create_sample 阶段输出（或反之），禁止各编各的标识符导致全部「未找到」。
- 集成正确性断言（硬性，见规则 15）：末尾集成阶段必须断言「≥1 行 query_status=success + ≥1 行有效告警/正常」，而非仅 len(rows)>=N；当全部行为「获取失败」时断言必须失败。
- 入口装配（硬性，见 ARTIFACT 规则 17 / MAIN ASSEMBLY）：≥3 个代码落盘模块时须含 main/index/App 入口 impl 或 npm start / expo start 等可检测启动阶段；禁止仅靠 stage_impl_integration 或纯 jest/npm test。
- 测试基础设施（硬性，M39.1）：若计划含 Jest/npm test 的 stage_test_run_* 或 .ts/.tsx 模块验证，首个 test_run 之前须有 jest.config.*（Expo 还须 babel.config.*）落盘阶段，见 TEST INFRASTRUCTURE BEFORE test_run 块。

===== 类型约束：document / other =====
- 通常 2～6 个阶段；不必 Rule 20；不必 npm init；
- 可用 llm-text + code-runner/file-write；Python 项目 code-runner 须遵守下方 PYTHON INFRA（venv + python3 -m pip）。
${PYTHON_CODE_RUNNER_CONSTRAINT_TEXT}`,
    ctx,
  );
}

function buildWorkflowGeneratorPromptForType(taskType: string, ctx?: WorkflowGeneratorContext): string {
  const base = GENERATOR_JSON_SCHEMA_BASE;

  if (taskType === 'prototype') {
    return appendCodebaseContextBlock(`${base}

${PROTOTYPE_CONSTRAINT_TEXT}

${TEST_INFRASTRUCTURE_BEFORE_TEST_RUN_TEXT}

补充要求：
- 优先最小可运行演示（MVP）而非完整功能面；
- 每个关键假设都应对应一个可观测验证信号；
- Python 多文件项目：**每个文件单独 writeOutputToFile 阶段**，禁止 setup_project.py 一次性生成全仓库；
- Excel 样本：create_sample 与所有 stage_test_run_* 必须使用同一 input.xlsx 路径与 ASIN/SKU/TargetPrice/Stock 列名；
- Python 验证阶段 MUST 使用 python3 -m venv .venv + .venv/bin/python -m pip（禁止 pip install && python 裸命令）。
- 交付闭环（硬性，见 ARTIFACT 对齐规则 11）：任务声明了输出文件（CSV/报告/导出）时，必须包含 writer 产出阶段 + main 入口阶段 + 末尾端到端集成阶段（跑 main 并断言产物存在/行数/必需列名）；不得止步于 analyzer 等中间模块。
- 验证覆盖（硬性，见规则 12）：最后一个核心模块也必须有 code-runner check；且至少一个 check 为跨模块集成（用上游真实输出喂下游），以暴露字段名/容器类型/模块名契约错位。
- 数据契约（硬性，见规则 13）：决策记录必须含 DATA_SCHEMA，钉死每个跨模块 dict 的字段名+类型+枚举（含「成功」枚举字面量，如 query_status=="success"）；reader/fetcher/analyzer/writer/mock_data 全部复用同一组键名，禁止 availability/stock_status、sku/tk_sku、success/OK 漂移。
- 共享样例源（硬性，见规则 14）：create_sample 与 mock_data 必须共享同一 ASIN/SKU 列表；mock_data 阶段 input.sources 须引用 create_sample 阶段 output（或反之）。
- 集成正确性断言（硬性，见规则 15）：末尾集成阶段必须断言「≥1 行 query_status=success + ≥1 行有效告警/正常」，而非仅 len(rows)>=N。
- 测试基础设施（M39.1，仅当含 Jest/TS 验证时）：见 TEST INFRASTRUCTURE BEFORE test_run 块。`, ctx);
  }

  if (taskType === 'debug') {
    return appendCodebaseContextBlock(`${base}

${DEBUG_CONSTRAINT_TEXT}

补充要求：
- 优先 AFK 链路，尽量使用可执行阶段表达复现与回归验证；
- 若必须 HITL，需在阶段描述中写明无法自动化的原因；
- 若复现/验证涉及 Python 脚本或 pip 依赖，code-runner 须遵守 PYTHON INFRA（venv + python3 -m pip，见 prototype 约束）。`, ctx);
  }

  if (taskType === 'document' || taskType === 'other') {
    return appendCodebaseContextBlock(`${base}

${PYTHON_CODE_RUNNER_CONSTRAINT_TEXT}

补充要求（${taskType}）：
- 通常 2～6 个阶段；可用 llm-text + code-runner/file-write。`, ctx);
  }

  if (taskType === 'refactor') {
    return appendCodebaseContextBlock(`${base}

${REFACTOR_CONSTRAINT_TEXT}

补充要求：
- 架构决策阶段同样遵循三层构成：§7.5 原文 + grill-with-docs 补充层 + §4.4 输出约束；
- 必须显式给出“行为等价”验证路径（test_run 或 code-runner）；
- Jest/npm test 验证时：首个 test_run 前须有 jest.config.*（Expo 还须 babel.config.*）落盘阶段（M39.1）；
- 若 meta.isGreenfield !== true，优先插入 stage_zoom_out(file-read) 产出 moduleMap，再由 decide/impl 消费。`, ctx);
  }

  if (taskType === 'improve-architecture') {
    return appendCodebaseContextBlock(`${base}

${IMPROVE_ARCHITECTURE_CONSTRAINT_TEXT}

补充要求：
- stage_zoom_out 产出模块地图；优先 llm-text + CONTEXT 词汇表；
- 决策须含 deletion-test 与 seam 列表；impl 须配对验证链。`, ctx);
  }

  if (taskType !== 'software') {
    return appendCodebaseContextBlock(base, ctx);
  }

  return appendCodebaseContextBlock(`${base}

${buildSoftwareGeneratorAppendix(ctx)}`, ctx);
}

export function buildWorkflowGeneratorPrompt(taskType: string, ctx?: WorkflowGeneratorContext): string {
  if (isAutoTaskType(taskType)) {
    return buildUnifiedAutoTaskTypePrompt(ctx);
  }
  return buildWorkflowGeneratorPromptForType(taskType, ctx);
}
