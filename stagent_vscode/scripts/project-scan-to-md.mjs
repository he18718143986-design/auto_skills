#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const d = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'scripts/project-scan-output.json'), 'utf8'),
);

const ROLE_OVERRIDES = {
  'src/WorkflowDefinition.ts': '工作流/阶段/工具/实例的核心类型与 JSON 契约定义。',
  'src/WorkflowEngine.ts': 'WorkflowEngine 编排总线：生成、执行、HITL、持久化与 Webview 桥接。',
  'src/WorkflowExecutorLoop.ts': '阶段执行主循环（DAG 波次、暂停、重试、质量门钩子）。',
  'src/WorkflowPrompts.ts': '内置 LLM 提示词拼装与 generateWorkflow 上下文注入。',
  'src/Rule20Verify.ts': 'Rule20 工作流结构/契约校验（与 CI verify-rule20 同源）。',
  'src/FsAsync.ts': '异步文件读写与存在性检测的薄封装。',
  'src/extension.ts': 'VS Code 扩展激活入口、视图注册与命令绑定。',
  'src/generated/PromptFragments.ts': '由 prompts/ 构建生成的提示词片段常量。',
  'src/webview/runtime/messages.ts': 'Extension ↔ Webview 前后端消息类型与载荷定义。',
  'src/webview/runtime/view-input.ts': '主面板输入区、生成/确认/追问等 UI 逻辑。',
  'src/webview/runtime/_extracted-bootstrap.js': '从 WebviewScript 提取的内联 bootstrap（构建产物）。',
  'src/ArtifactLifecycleManager.ts': '阶段产物（Artifact）状态机、哈希校验与磁盘持久化。',
  'src/WorkflowStateTransitions.ts': '实例/阶段状态迁移、重试计数与决策回滚规则。',
  'src/WorkflowDag.ts': '阶段依赖 DAG 构建、ready 集合与拓扑相关工具。',
  'src/QualityGate.ts': '质量门接口、阶段时机（when）与 GateResult 类型。',
  'src/QualityGateRunner.ts': '按 phase/priority 调度内置与自定义质量门。',
  'src/WorkflowGenerationOrchestrator.ts': 'generateWorkflow 管线编排（Rule20、计划门、结构修复）。',
  'src/CodeRunnerCommandLint.ts': 'code-runner 危险 shell 命令检测。',
  'src/CodeRunnerImportLint.ts': 'impl 输出与 code-runner import 路径一致性 lint。',
  'src/WorkflowPlanSummary.ts': '计划摘要、阶段边与展示用元数据。',
  'src/ArtifactUiHints.ts': '产物在 Webview 中的展示提示与阶段关联。',
  'src/test/webview-script-test-harness.ts': 'Webview 脚本/HTML 契约的集成测试夹具与断言工具。',
  'package-lock.json': 'npm 依赖锁定文件（非业务源码）。',
};

function roleOf(row) {
  return ROLE_OVERRIDES[row.path] || row.role;
}

function esc(s) {
  return String(s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

const excludeNoise = (r) =>
  !['.DS_Store', 'package-lock.json'].includes(path.basename(r.path));

const rows = d.rows.filter(excludeNoise);

let md = `# Stagent 项目扫描报告\n\n`;
md += `生成时间：${new Date().toISOString().slice(0, 10)}；扫描文件 **${rows.length}** 个（排除 \`node_modules\`/\`out\`/\`package-lock.json\` 等）。\n\n`;
md += `引用统计范围：\`src/**\` 下 \`.ts/.tsx/.js/.mjs\` 的相对路径 \`import\`。\n\n`;

md += `## 1. 全项目文件清单（路径 | 行数 | 职责）\n\n`;
md += `| 路径 | 行数 | 主要职责 |\n| --- | ---: | --- |\n`;
for (const r of rows) {
  md += `| \`${r.path}\` | ${r.lines} | ${esc(roleOf(r))} |\n`;
}

md += `\n## 2. 超过 500 行的文件（降序）\n\n`;
const over500 = rows.filter((r) => r.lines > 500).sort((a, b) => b.lines - a.lines);
md += `| 排名 | 路径 | 行数 | 主要职责 |\n| ---: | --- | ---: | --- |\n`;
over500.forEach((r, i) => {
  md += `| ${i + 1} | \`${r.path}\` | ${r.lines} | ${esc(roleOf(r))} |\n`;
});

md += `\n## 3. 被引用次数最多的前 10 个模块（src 相对 import）\n\n`;
md += `| 排名 | 路径 | 被引用次数 | 主要职责 |\n| ---: | --- | ---: | --- |\n`;
d.topRefs.forEach((r, i) => {
  const row = rows.find((x) => x.path === r.path) || r;
  md += `| ${i + 1} | \`${r.path}\` | ${r.count} | ${esc(roleOf(row))} |\n`;
});

md += `\n## 4. 循环依赖\n\n`;
md += `### 4.1 双向直接依赖（A ↔ B）\n\n`;
md += `| 模块 A | 模块 B |\n| --- | --- |\n`;
for (const { a, b } of d.pairs) {
  md += `| \`${a}\` | \`${b}\` |\n`;
}
md += `\n### 4.2 更长环路（≥3 节点）\n\n`;
md += `| 环路 |\n| --- |\n`;
for (const cycle of d.longer) {
  md += `| ${cycle.split(' → ').map((p) => `\`${p}\``).join(' → ')} |\n`;
}

const out = path.join(ROOT, 'docs/PROJECT_SCAN.md');
fs.writeFileSync(out, md);
console.log('Wrote', out, 'bytes', md.length);
