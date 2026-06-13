import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { uiMsg } from './l10n/uiStrings';
import type { WorkflowDefinition } from './WorkflowDefinition';
import { taskInstanceDir } from './paths/StagentPaths';
import { getDefaultTaskDir } from './WorkflowPersistence';

/** `~` / `~/x` 展开为绝对用户目录；其余原样返回（已 trim）。 */
export function expandUserHomePath(raw: string): string {
  const t = raw.trim();
  if (t === '~') {
    return os.homedir();
  }
  if (t.startsWith('~/') || t.startsWith('~\\')) {
    return path.join(os.homedir(), t.slice(2));
  }
  return t;
}

/** 校验用户输入的工作区根路径：存在且为目录，返回绝对路径。 */
export function resolveExistingDirectoryPath(
  raw: string,
): { ok: true; abs: string } | { ok: false; reason: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      ok: false,
      reason: uiMsg('stagent.pathResolver.emptyWorkspacePath'),
    };
  }
  const expanded = expandUserHomePath(trimmed);
  const abs = path.resolve(expanded);
  try {
    if (!fs.existsSync(abs)) {
      return { ok: false, reason: uiMsg('stagent.pathResolver.notFound', abs) };
    }
    if (!fs.statSync(abs).isDirectory()) {
      return { ok: false, reason: uiMsg('stagent.pathResolver.notDirectory', abs) };
    }
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: uiMsg('stagent.pathResolver.accessFailed', abs, detail) };
  }
  return { ok: true, abs };
}

/**
 * 从实例 taskDir 反推工作区根：`<ws>/.stagent/instances/<id>` → `<ws>`。
 * taskDir 结构不符时返回 undefined。
 */
export function workspaceRootFromTaskDir(taskDir?: string): string | undefined {
  if (!taskDir?.trim()) {
    return undefined;
  }
  const instancesDir = path.dirname(path.resolve(taskDir));
  if (path.basename(instancesDir) !== 'instances') {
    return undefined;
  }
  const stagentDir = path.dirname(instancesDir);
  if (path.basename(stagentDir) !== '.stagent') {
    return undefined;
  }
  return path.dirname(stagentDir);
}

/**
 * 将 meta.taskWorkspacePath 钉死为绝对路径。
 * 相对路径优先相对 taskDir 所属工作区解析，避免执行期 cwd 变化导致 `../T4` 漂移。
 */
export function pinTaskWorkspacePathAbsolute(
  taskWorkspacePath: string | undefined,
  taskDirHint?: string,
): string | undefined {
  const fromTaskDir = workspaceRootFromTaskDir(taskDirHint);
  const raw = taskWorkspacePath?.trim();
  if (!raw) {
    return fromTaskDir;
  }
  const expanded = expandUserHomePath(raw);
  if (path.isAbsolute(expanded)) {
    return path.resolve(expanded);
  }
  if (fromTaskDir) {
    return path.resolve(fromTaskDir, expanded);
  }
  return path.resolve(expanded);
}

/** `meta.taskWorkspacePath` 解析为绝对路径；缺失/空白时尝试 taskDir 反推。 */
export function resolveWorkspaceRootAbsolute(
  taskWorkspacePath?: string,
  taskDirHint?: string,
): string | undefined {
  const pinned = pinTaskWorkspacePathAbsolute(taskWorkspacePath, taskDirHint);
  if (pinned) {
    return pinned;
  }
  return workspaceRootFromTaskDir(taskDirHint);
}

/**
 * 解析路径中「已存在部分」的 symlink：自底向上找到最近的已存在祖先并对其 realpath，
 * 再拼回尚不存在的尾段（写文件时目标常不存在）。尾段不可能是 symlink（不存在），
 * 故结果可与同样处理的 root 做归一化对比。realpathSync 失败（ELOOP/EACCES 等）向上抛。
 */
function realpathOfNearestExisting(p: string): string {
  let current = path.resolve(p);
  const suffix: string[] = [];
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) {
      return current;
    }
    suffix.unshift(path.basename(current));
    current = parent;
  }
  const real = fs.realpathSync(current);
  return suffix.length > 0 ? path.join(real, ...suffix) : real;
}

/**
 * 将 relativePath 限制在 root 之下；越界抛错。
 * 两道闸：
 *   1. 词法校验（path.relative）拦截 `..` / 绝对路径逃逸；
 *   2. realpath 复校——解析「已存在部分」的 symlink 后再比对，拦截
 *      「workspace 内软链指向外部」（如 `<root>/link -> /etc`）这类词法看不出的逃逸。
 * 两侧用同一套 realpath 语义，避免 `/tmp`→`/private/tmp` 等导致的误判。
 */
export function safeJoinUnderWorkspaceRoot(root: string, relativePath: string): string {
  const r = path.resolve(root);
  const joined = path.resolve(r, relativePath);
  const rel = path.relative(r, joined);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(uiMsg('stagent.pathResolver.escapeWorkspace', relativePath));
  }

  let realRoot: string;
  try {
    realRoot = realpathOfNearestExisting(r);
  } catch {
    realRoot = r;
  }
  let realJoined: string;
  try {
    realJoined = realpathOfNearestExisting(joined);
  } catch {
    // 解析失败（如 symlink 环）按逃逸处理，宁拒绝勿误写。
    throw new Error(uiMsg('stagent.pathResolver.escapeWorkspace', relativePath));
  }
  const realRel = path.relative(realRoot, realJoined);
  if (realRel.startsWith('..') || path.isAbsolute(realRel)) {
    throw new Error(uiMsg('stagent.pathResolver.escapeWorkspace', relativePath));
  }

  return joined;
}

/** 可读项目根：当前 vscode 工作区根（若有）+ `process.cwd()`（去重）。 */
export function getReadableProjectRoots(workspaceRoot?: string): string[] {
  const out: string[] = [];
  if (workspaceRoot) {
    out.push(workspaceRoot);
  }
  const cwd = process.cwd();
  if (cwd && !out.includes(cwd)) {
    out.push(cwd);
  }
  return out;
}

import {
  WORKSPACE_PACKAGE_JSON,
  WORKSPACE_TSCONFIG_JSON,
  ZOOM_OUT_FALLBACK_CANDIDATES,
} from './workspace/WorkspaceRootFilenames';
export function pickZoomOutFilePath(roots: string[], preferred?: string): string {
  const candidates = [preferred?.trim(), ...ZOOM_OUT_FALLBACK_CANDIDATES].filter(
    (v): v is string => Boolean(v && v.trim()),
  );
  for (const rel of candidates) {
    if (path.isAbsolute(rel)) {
      if (fs.existsSync(rel)) {
        return rel;
      }
      continue;
    }
    for (const root of roots) {
      if (fs.existsSync(path.join(root, rel))) {
        return rel;
      }
    }
  }
  return preferred?.trim() || WORKSPACE_PACKAGE_JSON;
}

/**
 * 新实例 `taskDir`：`meta.taskWorkspacePath` → `taskInstanceDir`（见 `StagentPaths`）；否则回退已打开工作区。
 * `workspaceRoot` 为当前 vscode 工作区根（无则 undefined），`globalStoragePath` 为扩展全局存储路径。
 */
export function resolveInitialTaskDir(
  instanceId: string,
  wf: WorkflowDefinition,
  workspaceRoot: string | undefined,
  globalStoragePath: string,
): { ok: true; dir: string } | { ok: false; reason: string } {
  const raw = wf.meta?.taskWorkspacePath?.trim();
  if (raw) {
    const dirCheck = resolveExistingDirectoryPath(raw);
    if (!dirCheck.ok) {
      return { ok: false, reason: dirCheck.reason };
    }
    return { ok: true, dir: taskInstanceDir(dirCheck.abs, instanceId) };
  }
  if (!workspaceRoot) {
    return {
      ok: false,
      reason: uiMsg('stagent.pathResolver.missingTaskDir'),
    };
  }
  return {
    ok: true,
    dir: getDefaultTaskDir(instanceId, workspaceRoot, globalStoragePath),
  };
}

/** 预执行壳 taskDir：有工作文件夹则 `taskInstanceDir`，否则 globalStorage/instances/<id>。 */
export function resolvePreExecTaskDir(
  instanceId: string,
  taskWorkspacePathRaw: string | undefined,
  _workspaceRoot: string | undefined,
  globalStoragePath: string,
): { ok: true; dir: string } | { ok: false; reason: string } {
  const raw = taskWorkspacePathRaw?.trim();
  if (raw) {
    const dirCheck = resolveExistingDirectoryPath(raw);
    if (!dirCheck.ok) {
      return { ok: false, reason: dirCheck.reason };
    }
    return { ok: true, dir: taskInstanceDir(dirCheck.abs, instanceId) };
  }
  return { ok: true, dir: getDefaultTaskDir(instanceId, undefined, globalStoragePath) };
}
