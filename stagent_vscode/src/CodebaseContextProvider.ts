import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
  CODEBASE_GIT_DIFF_STAT_MAX,
  CODEBASE_MODULE_NAME_MAX,
  CODEBASE_SNAPSHOT_MODULE_MAX,
} from './CodebaseContextLimits';
import { CODEBASE_EXPORTS_PREVIEW_MAX } from './UiListLimits';
import { GIT_DIFF_TIMEOUT_MS } from './TimeConstants';
import { DEFAULT_WORKSPACE_SKIP_DIR_NAMES as SKIP_DIR_NAMES } from './workspace/WorkspaceSkipDirs';
import { listSourceFiles as walkSourceFiles } from './workspace/listSourceFiles';
import {
  WORKSPACE_PACKAGE_JSON,
  WORKSPACE_SRC_DIR,
  WORKSPACE_TSCONFIG_JSON,
} from './workspace/WorkspaceRootFilenames';

export type ProjectType = 'node' | 'react' | 'uniapp' | 'python' | 'unknown';
export type CodebaseSnapshotLevel = 'full' | 'summary' | 'filenames-only' | 'omit';

export interface ModuleSummary {
  path: string;
  exports: string[];
  linesOfCode: number;
  hasTests: boolean;
}

export interface CodebaseSnapshot {
  projectType: ProjectType;
  packageJson?: Record<string, unknown>;
  tsconfig?: Record<string, unknown>;
  entryFiles: string[];
  existingModules: ModuleSummary[];
  gitChangeSummary?: string;
  level: CodebaseSnapshotLevel;
  workspaceRoot: string;
  /** 扫描时读取失败被跳过的源文件数（>0 表示喂给 LLM 的上下文不完整）。 */
  readErrors?: number;
}

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.vue']);

export function estimateTextTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function safeReadJson(
  filePath: string,
  onDegraded?: (reason: string, context?: Record<string, unknown>) => void,
): Record<string, unknown> | undefined {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
  } catch (e) {
    // 文件存在却读取/解析失败属异常（损坏 JSON / 权限）：结构化告警后降级返回 undefined。
    onDegraded?.('codebase_snapshot_read_json_failed', {
      path: filePath,
      err: e instanceof Error ? e.message : String(e),
    });
    return undefined;
  }
}

function mergeDeps(packageJson: Record<string, unknown>): Record<string, unknown> {
  return {
    ...((packageJson.dependencies as Record<string, unknown>) ?? {}),
    ...((packageJson.devDependencies as Record<string, unknown>) ?? {}),
  };
}

export function detectProjectType(packageJson?: Record<string, unknown>): ProjectType {
  if (!packageJson) {
    return 'unknown';
  }
  const deps = mergeDeps(packageJson);
  if (deps['@dcloudio/uni-app'] || deps['@dcloudio/vite-plugin-uni']) {
    return 'uniapp';
  }
  if (deps.react || deps['react-dom'] || deps.next) {
    return 'react';
  }
  if (Object.keys(deps).some((k) => k.startsWith('django') || k === 'flask' || k === 'fastapi')) {
    return 'python';
  }
  if (packageJson.name || deps.typescript || deps.express || deps.vite) {
    return 'node';
  }
  return 'unknown';
}

function listSourceFiles(scanRoot: string, maxFiles: number): string[] {
  return walkSourceFiles(scanRoot, {
    maxFiles,
    maxDepth: 8,
    extensions: SOURCE_EXTENSIONS,
    skipDirNames: SKIP_DIR_NAMES,
  }).map((abs) => path.relative(scanRoot, abs));
}

function extractExports(content: string): string[] {
  const names: string[] = [];
  const patterns = [
    /export\s+(?:async\s+)?function\s+(\w+)/g,
    /export\s+(?:async\s+)?class\s+(\w+)/g,
    /export\s+(?:const|let|var)\s+(\w+)/g,
    /export\s+type\s+(\w+)/g,
    /export\s+interface\s+(\w+)/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      names.push(m[1]);
    }
  }
  return [...new Set(names)].slice(0, CODEBASE_MODULE_NAME_MAX);
}

function readGitChangeSummary(workspaceRoot: string): string | undefined {
  try {
    const out = execSync('git diff --stat HEAD', {
      cwd: workspaceRoot,
      encoding: 'utf-8',
      timeout: GIT_DIFF_TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return out ? out.slice(0, CODEBASE_GIT_DIFF_STAT_MAX) : undefined;
  } catch {
    // 保持静默：非 git 仓库 / 未安装 git 是正常状态，结构化告警在这里只会刷屏噪声。
    return undefined;
  }
}

/** 同步构建工作区快照（无 LLM）；大仓库由 `applySnapshotDegradation` 渐进降级。 */
export function buildCodebaseSnapshot(
  workspaceRoot: string,
  options?: {
    maxModules?: number;
    onDegraded?: (reason: string, context?: Record<string, unknown>) => void;
  },
): CodebaseSnapshot {
  const abs = path.resolve(workspaceRoot);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
    return {
      projectType: 'unknown',
      entryFiles: [],
      existingModules: [],
      level: 'omit',
      workspaceRoot: abs,
    };
  }

  const onDegraded = options?.onDegraded;
  const packageJson = safeReadJson(path.join(abs, WORKSPACE_PACKAGE_JSON), onDegraded);
  const tsconfig = safeReadJson(path.join(abs, WORKSPACE_TSCONFIG_JSON), onDegraded);
  const projectType = detectProjectType(packageJson);

  const entryCandidates = [
    'src/index.ts',
    'src/main.ts',
    'src/main.tsx',
    'src/index.tsx',
    'index.ts',
    'main.py',
  ];
  const entryFiles = entryCandidates.filter((f) => fs.existsSync(path.join(abs, f)));

  const srcDir = path.join(abs, WORKSPACE_SRC_DIR);
  const hasSrc = fs.existsSync(srcDir) && fs.statSync(srcDir).isDirectory();
  const scanRoot = hasSrc ? srcDir : abs;
  const relPrefix = hasSrc ? 'src/' : '';
  const files = listSourceFiles(scanRoot, options?.maxModules ?? CODEBASE_SNAPSHOT_MODULE_MAX);
  let readErrors = 0;
  const existingModules: ModuleSummary[] = files.map((rel) => {
    const full = path.join(scanRoot, rel);
    let content: string;
    try {
      content = fs.readFileSync(full, 'utf-8');
    } catch {
      // 不再静默吞掉：计数后由 buildCodebaseSnapshot 写入 snapshot.readErrors，
      // 使「上下文不完整」对调用方与 LLM 提示词均可见。
      readErrors += 1;
      content = '';
    }
    const base = path.basename(rel);
    return {
      path: `${relPrefix}${rel}`.replace(/\\/g, '/'),
      exports: extractExports(content),
      linesOfCode: content ? content.split('\n').length : 0,
      hasTests: /(?:^|[/\\])(?:.*\.)?(?:test|spec)\./i.test(base) || /(?:^|[/\\]).*(?:test|spec)[/\\]/i.test(rel),
    };
  });

  return {
    projectType,
    packageJson,
    tsconfig,
    entryFiles,
    existingModules,
    gitChangeSummary: readGitChangeSummary(abs),
    level: 'full',
    workspaceRoot: abs,
    readErrors,
  };
}

export function formatSnapshotForPrompt(
  snapshot: CodebaseSnapshot,
  level: CodebaseSnapshotLevel = snapshot.level,
): string {
  if (level === 'omit') {
    return '';
  }

  const lines: string[] = [`项目类型: ${snapshot.projectType}`];

  if (level === 'filenames-only') {
    lines.push('源文件列表（仅路径）:');
    for (const mod of snapshot.existingModules.slice(0, CODEBASE_SNAPSHOT_MODULE_MAX)) {
      lines.push(`- ${mod.path}`);
    }
    return lines.join('\n');
  }

  if (snapshot.packageJson) {
    const name = snapshot.packageJson.name ?? '?';
    const scripts = snapshot.packageJson.scripts ?? {};
    lines.push(`package.json: name=${String(name)}, scripts=${JSON.stringify(scripts)}`);
  }
  if (snapshot.tsconfig && level === 'full') {
    const compilerOptions = snapshot.tsconfig.compilerOptions ?? {};
    lines.push(`tsconfig: compilerOptions=${JSON.stringify(compilerOptions)}`);
  }
  if (snapshot.entryFiles.length > 0) {
    lines.push(`入口文件: ${snapshot.entryFiles.join(', ')}`);
  }

  lines.push(`模块概览（${snapshot.existingModules.length} 个源文件）:`);
  const cap = level === 'summary' ? 40 : 80;
  for (const mod of snapshot.existingModules.slice(0, cap)) {
    const exportHint =
      mod.exports.length > 0 && level === 'full'
        ? `, exports: ${mod.exports.slice(0, CODEBASE_EXPORTS_PREVIEW_MAX).join(', ')}`
        : '';
    lines.push(`- ${mod.path} (${mod.linesOfCode} LOC${exportHint})`);
  }
  if (snapshot.existingModules.length > cap) {
    lines.push(`… 另有 ${snapshot.existingModules.length - cap} 个文件未列出`);
  }

  if (snapshot.gitChangeSummary && level === 'full') {
    lines.push('\nGit 变更摘要 (git diff --stat HEAD):');
    lines.push(snapshot.gitChangeSummary);
  }

  if (snapshot.readErrors && snapshot.readErrors > 0) {
    lines.push(`\n⚠️ 注意：有 ${snapshot.readErrors} 个源文件读取失败被跳过，以上代码库概览可能不完整。`);
  }

  return lines.join('\n');
}

/** 渐进降级 full → summary → filenames-only → omit，直至不超过 maxTokens。 */
export function applySnapshotDegradation(
  snapshot: CodebaseSnapshot,
  maxTokens: number,
): { text: string; level: CodebaseSnapshotLevel } {
  const order: CodebaseSnapshotLevel[] = ['full', 'summary', 'filenames-only', 'omit'];
  for (const level of order) {
    const text = formatSnapshotForPrompt(snapshot, level);
    if (!text.trim()) {
      continue;
    }
    if (estimateTextTokens(text) <= maxTokens) {
      return { text, level };
    }
  }
  return { text: '', level: 'omit' };
}
