#!/usr/bin/env node
/**
 * 同步 package.json contributes.configuration：清理 Mxx 描述、添加 order / markdownDescription。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkgPath = path.join(ROOT, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const props = pkg.contributes.configuration.properties;
const DOCS = 'https://github.com/he18718143986-design/stagent/blob/main/docs/settings/README.md';

const descriptionPatches = {
  'stagent.enableRuntimeRule20Verify':
    'generateWorkflow 时在引擎内运行 verifyRule20（与 CI 同源）；violations 阻断生成（workflowFailed），warnings 写入 workflowGenerated.warnings。设为 false 则跳过运行时 Rule20 校验。',
  'stagent.enableDecisionContentLint':
    'approveDecision 时对 DecisionRecord 做结构校验（I-17~I-19）。workflow globalConfig.enableDecisionContentLint 可覆盖；显式 false 关闭。',
  'stagent.dagMaxParallelism':
    'DAG 模式下每波最多并行执行的阶段数（默认 2；设为 1 等同单线程）。≥2 时无依赖关系的 ready 阶段可同波并行；决策/pauseAfter/questionBefore 仍串行。workflow globalConfig.dagMaxParallelism 可覆盖。',
  'stagent.hitl.pauseContractNodes':
    '对「契约节点」（被 ≥2 个下游引用，或 reader/fetcher/analyzer/writer/main 等数据管道核心 impl）在置信度未达 contractNodePauseThreshold 时升级为人工暂停复审。设为 false 则仅使用 confidence.pauseThreshold。',
  'stagent.hitl.contractNodePauseThreshold':
    '契约节点暂停阈值（0-1）。契约节点置信度低于此值即暂停（默认 0.75）。',
  'stagent.plan.requireCompleteness':
    '多文件 prototype/software 计划完整性硬门。缺少可执行验证阶段、main 入口装配（≥3 模块）、或首个 test_run 前的 Jest/Babel/tsconfig 测试基础设施时，阻断生成并在只读确认页展示拦截原因。设为 false 关闭。',
  'stagent.plan.structuralRepair':
    '计划完整性门禁命中后，对 missing-verification-stage / missing-test-infrastructure / missing-self-heal-chain 做确定性阶段插入（标有「[系统插入]」），再 normalize 并重跑校验。不修 missing-main-assembly。auto 启用；off 仅阻断（默认）。',
  'stagent.execution.testRunPreflight':
    'stage_test_run_* 执行前检测工作区是否已有 jest.config.* / babel.config.* / tsconfig.json（Expo 栈需 jest+babel）。缺失则阻断并给出可读 stageError。设为 false 关闭运行期预检。',
  'stagent.execution.splitTestRunBundledCommands':
    '生成 normalize 时将 stage_test_run_* 内「npm install && jest/test」等复合 command 拆成独立 stage_deps_install_* 与纯测试 command。设为 false 关闭自动拆分。',
  'stagent.execution.testRunFailurePlaybook':
    'stage_test_run_* 失败时根据 stderr 分类生成可读修复 playbook，替换裸 tool-execution-failed。设为 false 关闭。',
  'stagent.execution.sdkPathContractLint':
    'DecisionRecord ↔ impl ↔ test SDK/路径契约 lint。warn=写 warning 日志（默认）；hard=stage_test_run_* 前阻断；off=关闭。',
  'stagent.tdd.redGreenGate':
    '红绿门：impl 执行前要求配对测试处于 RED。off=关闭；warn=仅写日志/告警（默认）；hard=在 impl 前运行配对测试，若已 GREEN 则阻断。',
  'stagent.debug.requireFeedbackLoop':
    'debug 任务「反馈回路优先」。hard=生成期 Rule20 violation + 运行期阻断；warn=仅 warning；off=关闭。兼容旧版 boolean（true→hard，false→off）。',
  'stagent.grill.adaptiveMode':
    '强制开启决策阶段「一次一问」grill（覆盖 autoOnDecisionStages）。false 时仅在 autoOnDecisionStages 启发式命中时启用。',
  'stagent.grill.autoOnDecisionStages':
    '决策阶段且含 questionBefore 时，对契约节点或高复杂度任务自动启用 adaptive grill（一次一问 + code-explore）。设为 false 回退批量追问表单。',
  'stagent.glossary.enabled':
    '活 .stagent/CONTEXT.md 词汇表 + 轻量 ADR 留存。开启后跨文件键名一致性以词汇表为权威字典。设为 false 关闭读写。',
  'stagent.architecture.depthScoring':
    '深模块评分接入质量分：对「浅模块」降分并提示。默认关闭。',
  'stagent.memory.enableExperienceStore':
    '持久化工作流执行经验到 .stagent/experiences.jsonl。设为 false 可关闭写入。',
  'stagent.experience.injectOnGenerate':
    'generateWorkflow 时从 .stagent/experiences.jsonl 注入 few-shot 摘要（不含 userInput 原文；不改写决策阶段合同 prompt）。',
  'stagent.promptVersions.enabled':
    'generateWorkflow 从 .stagent/prompt-versions.json 读取可变 prompt 槽位（protected 槽位仍不可改写）。设为 false 回退 WorkflowPrompts 硬编码 seed。',
  'stagent.staticAnalysis.enabled':
    '工作流生成后与 stage_impl_* 完成后运行 StaticAnalysisPipeline（tsc / imports；不阻断 workflow）。',
  'stagent.settingsProfile':
    '预设 Profile：strict=全 hard 门禁；relaxed=warn 为主；minimal=关闭非核心门禁。显式 stagent.* 键值仍优先；激活时 validateSettings 会提示矛盾或漂移。',
};

const orderMap = {
  'stagent.settingsProfile': 1,
  'stagent.debugVerbose': 2,
  'stagent.llmApiKey': 10,
  'stagent.llmBaseUrl': 11,
  'stagent.llmModel': 12,
  'stagent.llmTimeoutSeconds': 13,
  'stagent.llmMaxOutputTokens': 14,
  'stagent.enableRuntimeRule20Verify': 20,
  'stagent.autoInsertGlobalArchitectureDecision': 21,
  'stagent.plan.requireCompleteness': 22,
  'stagent.plan.structuralRepair': 23,
  'stagent.generation.maxParseRetries': 24,
  'stagent.execution.testRunPreflight': 30,
  'stagent.execution.splitTestRunBundledCommands': 31,
  'stagent.execution.testRunFailurePlaybook': 32,
  'stagent.execution.sdkPathContractLint': 33,
  'stagent.execution.dangerousCommandLint': 34,
  'stagent.dagMaxParallelism': 35,
  'stagent.tdd.redGreenGate': 40,
  'stagent.toIssues.horizontalLayeringFail': 42,
  'stagent.debug.requireFeedbackLoop': 41,
  'stagent.confidence.pauseThreshold': 50,
  'stagent.hitl.pauseContractNodes': 51,
  'stagent.hitl.contractNodePauseThreshold': 52,
  'stagent.enableDecisionContentLint': 53,
  'stagent.maxManualStageRetries': 54,
  'stagent.injectApprovedDecisionContext': 55,
  'stagent.globalDecisionInjectMode': 56,
  'stagent.grill.adaptiveMode': 60,
  'stagent.grill.autoOnDecisionStages': 61,
  'stagent.glossary.enabled': 62,
  'stagent.architecture.depthScoring': 63,
  'stagent.memory.enableExperienceStore': 70,
  'stagent.memory.maxExperienceEntries': 71,
  'stagent.experience.injectOnGenerate': 72,
  'stagent.sandbox.enabled': 80,
  'stagent.codebaseContext.enabled': 81,
  'stagent.codebaseContext.maxTokens': 82,
  'stagent.agentRoleOverrides': 83,
  'stagent.promptVersions.enabled': 84,
  'stagent.staticAnalysis.enabled': 85,
  'stagent.feedback.formUrl': 90,
  'stagent.feedback.cooldownDays': 91,
};

for (const [key, entry] of Object.entries(props)) {
  if (descriptionPatches[key]) {
    entry.description = descriptionPatches[key];
  }
  if (orderMap[key] !== undefined) {
    entry.order = orderMap[key];
  }
  if (!entry.markdownDescription) {
    entry.markdownDescription =
      `${entry.description}\n\n详见 [配置文档](${DOCS})。`;
  }
  if (entry.description && /M[0-9]+(\.[0-9]+)?|v2\.[0-9]/.test(entry.description)) {
    entry.description = entry.description
      .replace(/v2\.[0-9.]+\/M[0-9.]+[：:]\s*/g, '')
      .replace(/M[0-9]+(\.[0-9]+)?[（(][^）)]*[）)]\s*[：:]\s*/g, '')
      .replace(/M[0-9]+(\.[0-9]+)?[：:]\s*/g, '')
      .replace(/（M[0-9.]+）/g, '')
      .replace(/\[系统插入 · M[0-9]+\]/g, '[系统插入]')
      .trim();
    if (!descriptionPatches[key]) {
      entry.markdownDescription =
        `${entry.description}\n\n详见 [配置文档](${DOCS})。`;
    }
  }
}

fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
console.log('Updated package.json configuration metadata');

// ── catalog ↔ package.json 双向契约校验（--check 时 CI 失败，否则仅告警） ──
const checkMode = process.argv.includes('--check');
const catalogKeys = collectCatalogKeys(ROOT);
if (catalogKeys) {
  const contributesKeys = new Set(
    Object.keys(props).map((k) => (k.startsWith('stagent.') ? k.slice('stagent.'.length) : k)),
  );
  const missingInContributes = [...catalogKeys].filter((k) => !contributesKeys.has(k));
  const missingInCatalog = [...contributesKeys].filter((k) => !catalogKeys.has(k));
  if (missingInContributes.length > 0 || missingInCatalog.length > 0) {
    console.error('[settings-contract] catalog ↔ package.json 漂移：');
    if (missingInContributes.length > 0) {
      console.error(`  catalog 有但 package.json contributes 缺：${missingInContributes.join(', ')}`);
    }
    if (missingInCatalog.length > 0) {
      console.error(`  package.json contributes 有但 catalog 缺：${missingInCatalog.join(', ')}`);
    }
    if (checkMode) {
      process.exit(1);
    }
  } else {
    console.log('[settings-contract] catalog ↔ package.json 一致');
  }
}

/** 从 src/settings/catalog/*.ts 提取所有 `key: '...'`（轻量正则，无需编译 TS）。 */
function collectCatalogKeys(root) {
  const dir = path.join(root, 'src', 'settings', 'catalog');
  if (!fs.existsSync(dir)) {
    return undefined;
  }
  const keys = new Set();
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.ts') || file === 'types.ts' || file === 'index.ts') {
      continue;
    }
    const text = fs.readFileSync(path.join(dir, file), 'utf8');
    for (const m of text.matchAll(/key:\s*'([^']+)'/g)) {
      keys.add(m[1]);
    }
  }
  return keys;
}
