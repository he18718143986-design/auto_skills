/**
 * code-runner 命令的反模式 lint（B-2）。
 *
 * 在两处共享调用：
 * 1. 生成期：`validateGeneratedWorkflow` — 命中为 HARD GATE 错误（拒推 workflowGenerated）。
 * 2. 运行期：`WorkflowExecutor.executeNonLlmTool` 在 spawn 之前 — 命中抛 `invariant-violation:`，
 *    便于已持久化旧工作流在恢复/重试时立刻得到可操作建议。
 *
 * 规则集（code 便于脚本 / analyze-failures 聚合）：
 *   T1 `tsc-noemit-vs-out-dependency` — tsc … --noEmit 与同条 command 内的 require/node ./out/… 并存
 *   T2 `tsc-without-npx` — 出现裸 `tsc` 调用（非 npx / pnpm exec / yarn dlx / .bin/ 链式启动）
 *   T3 `bare-tsc-without-project` — 出现 `tsc` 但未带 `-p` / `--project` / `-b`（工程编译）
 *   T4 `missing-npm-install-before-tsc` — command 含 `tsc`，且同条 command 内无 install/ci，且线性顺序上此前无 npm install/ci 类 code-runner
 *   T5 `import-meta-url-with-commonjs` — workspace 存在 tsconfig.json 且 module 为 CommonJS 系，而 src/ 下源码含 import.meta（与 Node emit 不兼容）
 *   T6 `bundled-install-and-test-run` — stage_test_run_* 同条 command 串联 install 与 jest/test（M38.2；normalize 可自动拆分）
 */

import * as fs from 'fs';
import * as path from 'path';
import { isTestRunStageId } from './workflow/StageIdPatterns';
import { isCodeRunnerTool } from './workflow/StageToolKinds';
import type { CodeRunnerConfig, WorkflowDefinition } from './WorkflowDefinition';
import { collectWorkflowArtifacts } from './WorkflowArtifactRegistry';
import { detectPythonImportLintIssues } from './CodeRunnerImportLint';
import { detectBundledInstallAndTestRunIssue } from './TestRunCommandNormalize';
import { commandSelfHasDependencyInstall } from './workflow/CodeRunnerCommandSemantics';
import { readDangerousCommandLintMode } from './StagentSettings';
import { lintMsg, lintMsgForCode } from './l10n/lintMsg';
import { pushCodedLintIssue } from './lint/CodedLintIssue';
import { WORKSPACE_SRC_DIR, WORKSPACE_TSCONFIG_JSON } from './workspace/WorkspaceRootFilenames';

export interface CodeRunnerCommandIssue {
  code: string;
  message: string;
}

function hasTscNoEmit(cmd: string): boolean {
  return /\btsc\b[^|&;\n]*--noEmit\b/.test(cmd);
}

function hasOutDependency(cmd: string): boolean {
  const requireOut = /require\s*\(\s*\\?['"`]\.{0,2}\/?out\//.test(cmd);
  const nodeOut = /\bnode\b\s+(?:--?\S+\s+)*\\?['"`]?\.{0,2}\/?out\//.test(cmd);
  return requireOut || nodeOut;
}

/** 任一 `tsc` 词元前是否由 npx / pnpm exec / yarn dlx 或 node_modules/.bin/ 启动 */
function everyTscAcceptablyLaunched(cmd: string): boolean {
  const re = /\btsc\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cmd)) !== null) {
    const before = cmd.slice(0, m.index).trimEnd();
    if (!before) {
      return false;
    }
    const ok =
      /\bnpx\s*$/i.test(before) ||
      /\bpnpm\s+exec\s*$/i.test(before) ||
      /\byarn\s+dlx\s*$/i.test(before) ||
      /[/\\]\.bin[/\\]\s*$/i.test(before);
    if (!ok) {
      return false;
    }
  }
  return true;
}

function hasTscToken(cmd: string): boolean {
  return /\btsc\b/.test(cmd);
}

function hasProjectStyleFlag(cmd: string): boolean {
  return /(^|[\s;&|])(-p|--project|-b)(=|\s|$)/.test(cmd);
}

function priorLinearStagesHadNpmInstall(stages: WorkflowDefinition['stages'], beforeIndex: number): boolean {
  const list = stages ?? [];
  for (let i = 0; i < beforeIndex; i += 1) {
    const s = list[i];
    if (!isCodeRunnerTool(s.tool)) {
      continue;
    }
    const cmd = (s.toolConfig as Partial<CodeRunnerConfig>).command;
    if (typeof cmd === 'string' && commandSelfHasDependencyInstall(cmd)) {
      return true;
    }
  }
  return false;
}

function tryParseTsconfigModule(tsconfigPath: string): string | undefined {
  try {
    const raw = fs.readFileSync(tsconfigPath, 'utf-8');
    const noBlock = raw.replace(/\/\*[\s\S]*?\*\//g, '');
    const noLine = noBlock.replace(/^\s*\/\/.*$/gm, '');
    const j = JSON.parse(noLine) as { compilerOptions?: { module?: string } };
    return j.compilerOptions?.module;
  } catch {
    return undefined;
  }
}

function isCommonJsLikeModule(mod: string | undefined): boolean {
  if (!mod) {
    return true;
  }
  const m = mod.toLowerCase();
  return m === 'commonjs' || m === 'none' || m === 'umd' || m === 'amd' || m === 'system';
}

function workspaceSrcUsesImportMeta(workspaceRoot: string): boolean {
  const srcDir = path.join(workspaceRoot, WORKSPACE_SRC_DIR);
  if (!fs.existsSync(srcDir) || !fs.statSync(srcDir).isDirectory()) {
    return false;
  }
  const walk = (dir: string, depth: number): boolean => {
    if (depth > 5) {
      return false;
    }
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return false;
    }
    for (const ent of entries) {
      if (ent.name === 'node_modules' || ent.name.startsWith('.')) {
        continue;
      }
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (walk(p, depth + 1)) {
          return true;
        }
      } else if (/\.(ts|mts|cts)$/.test(ent.name)) {
        try {
          const c = fs.readFileSync(p, 'utf-8');
          if (/\bimport\s*\.meta\b/.test(c)) {
            return true;
          }
        } catch {
          /* skip */
        }
      }
    }
    return false;
  };
  return walk(srcDir, 0);
}

export function detectImportMetaUrlVsCommonJsWorkspace(workspaceRoot: string | undefined): CodeRunnerCommandIssue[] {
  if (!workspaceRoot?.trim()) {
    return [];
  }
  const root = workspaceRoot.trim();
  if (!fs.existsSync(root)) {
    return [];
  }
  const tsconfigPath = path.join(root, WORKSPACE_TSCONFIG_JSON);
  if (!fs.existsSync(tsconfigPath)) {
    return [];
  }
  const mod = tryParseTsconfigModule(tsconfigPath);
  if (!isCommonJsLikeModule(mod)) {
    return [];
  }
  if (!workspaceSrcUsesImportMeta(root)) {
    return [];
  }
  const modLabel = JSON.stringify(mod ?? '(default/unresolved, treated as commonjs)');
  return [
    {
      code: 'import-meta-url-with-commonjs',
      message: lintMsg('stagent.lint.import-meta-url-with-commonjs', modLabel),
    },
  ];
}

/** 危险 shell 模式（D7）；强度由 stagent.execution.dangerousCommandLint 控制。 */
export function detectDangerousShellCommandIssues(command: string): CodeRunnerCommandIssue[] {
  const issues: CodeRunnerCommandIssue[] = [];
  if (typeof command !== 'string' || command.length === 0) {
    return issues;
  }
  if (/\brm\s+-rf\s+\/\s*/.test(command) || /\brm\s+-rf\s+~\s*/.test(command)) {
    pushCodedLintIssue(issues, 'dangerous-rm-rf-root', lintMsgForCode('dangerous-rm-rf-root'));
  }
  if (/\bcurl\b[^\n|]*\|\s*(ba)?sh\b/i.test(command) || /\bwget\b[^\n|]*\|\s*(ba)?sh\b/i.test(command)) {
    pushCodedLintIssue(issues, 'dangerous-curl-pipe-shell', lintMsgForCode('dangerous-curl-pipe-shell'));
  }
  if (/:\(\)\s*\{\s*:\|:&\s*\}\s*;:/.test(command)) {
    pushCodedLintIssue(issues, 'dangerous-fork-bomb', lintMsgForCode('dangerous-fork-bomb'));
  }
  return issues;
}

export function isDangerousCommandIssue(issue: CodeRunnerCommandIssue): boolean {
  return issue.code.startsWith('dangerous-');
}

export function detectCodeRunnerCommandIssues(command: string): CodeRunnerCommandIssue[] {
  const issues: CodeRunnerCommandIssue[] = [];
  if (typeof command !== 'string' || command.length === 0) {
    return issues;
  }
  if (hasTscNoEmit(command) && hasOutDependency(command)) {
    pushCodedLintIssue(issues, 'tsc-noemit-vs-out-dependency', lintMsgForCode('tsc-noemit-vs-out-dependency'));
  }
  if (hasTscToken(command) && !everyTscAcceptablyLaunched(command)) {
    pushCodedLintIssue(issues, 'tsc-without-npx', lintMsgForCode('tsc-without-npx'));
  }
  if (hasTscToken(command) && !hasProjectStyleFlag(command)) {
    pushCodedLintIssue(issues, 'bare-tsc-without-project', lintMsgForCode('bare-tsc-without-project'));
  }
  return issues;
}

/** 依赖 stages 线性顺序与 meta.taskWorkspacePath（与生成期校验一致；DAG 模式下若阶段实际顺序与数组不一致可能漏报/误报）。 */
function detectCodeRunnerWorkflowLintIssues(
  command: string,
  wf: WorkflowDefinition,
  stageIndex: number,
): CodeRunnerCommandIssue[] {
  const issues: CodeRunnerCommandIssue[] = [];
  if (typeof command !== 'string' || !hasTscToken(command)) {
    return issues;
  }
  if (!commandSelfHasDependencyInstall(command) && !priorLinearStagesHadNpmInstall(wf.stages, stageIndex)) {
    pushCodedLintIssue(issues, 'missing-npm-install-before-tsc', lintMsgForCode('missing-npm-install-before-tsc'));
  }
  issues.push(...detectImportMetaUrlVsCommonJsWorkspace(wf.meta?.taskWorkspacePath));
  return issues;
}

export function collectAllCodeRunnerLintIssues(
  command: string,
  wf: WorkflowDefinition,
  stageIndex: number,
): CodeRunnerCommandIssue[] {
  const issues = [...detectCodeRunnerCommandIssues(command), ...detectCodeRunnerWorkflowLintIssues(command, wf, stageIndex)];
  if (readDangerousCommandLintMode() !== 'off') {
    issues.push(...detectDangerousShellCommandIssues(command));
  }
  const stage = wf.stages?.[stageIndex];
  if (stage && isTestRunStageId(stage.id) && isCodeRunnerTool(stage.tool)) {
    const bundled = detectBundledInstallAndTestRunIssue(command);
    if (bundled) {
      issues.push(bundled);
    }
    const registry = collectWorkflowArtifacts(wf);
    issues.push(...detectPythonImportLintIssues(command, registry, { stageId: stage.id }));
  }
  return issues;
}

export function formatCodeRunnerCommandIssue(stageId: string, issue: CodeRunnerCommandIssue): string {
  return lintMsg('stagent.lint.codeRunnerIssuePrefix', stageId, issue.code, issue.message);
}

/** 生成期 warn 模式：将危险命令写入 workflowGenerated.warnings。 */
export function collectDangerousCommandWarningsForWorkflow(wf: WorkflowDefinition): string[] {
  if (readDangerousCommandLintMode() !== 'warn') {
    return [];
  }
  const lines: string[] = [];
  for (let si = 0; si < (wf.stages ?? []).length; si++) {
    const stage = wf.stages[si];
    if (!isCodeRunnerTool(stage.tool)) {
      continue;
    }
    const cfg = stage.toolConfig as { command?: string };
    const cmd = String(cfg.command ?? '');
    for (const issue of detectDangerousShellCommandIssues(cmd)) {
      lines.push(`dangerous-cmd:${issue.code}:${stage.id}`);
    }
  }
  return lines;
}
