import * as path from 'path';
import type { WorkflowInstance } from './WorkflowDefinition';
import { REQUIREMENT_DOC_FILE, WORKFLOW_PLAN_DOC_FILE } from './WorkflowProcessDocs';

/**
 * 删除力度：
 * - record：仅删任务记录（globalState + `.stagent/instances/<id>` 状态目录）。
 * - artifacts：record + 删该任务「新建」的产物（artifactRegistry 中 existedBefore=false 的文件）
 *   及两份过程文档；不碰任务写入前已存在 / 用户手改的文件。
 * - folder：record + 递归删除整个 taskWorkspacePath（高危，受护栏约束）。
 */
export type DeleteScope = 'record' | 'artifacts' | 'folder';

export interface DeletionTargets {
  files: string[];
  dirs: string[];
  rejected: Array<{ path: string; reason: string }>;
}

export interface DeletionGuardOptions {
  homeDir?: string;
  minFolderDepth?: number;
}

function isUnder(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function segDepth(p: string): number {
  return p.split(/[\\/]+/).filter((s) => s.length > 0 && !/^[a-zA-Z]:$/.test(s)).length;
}

export function buildDeletionTargets(
  instance: WorkflowInstance | undefined,
  scope: DeleteScope,
  opts: DeletionGuardOptions = {},
): DeletionTargets {
  const out: DeletionTargets = { files: [], dirs: [], rejected: [] };
  if (!instance || scope === 'record') {
    return out;
  }

  const wsRaw = instance.definition?.meta?.taskWorkspacePath?.trim();
  const wsAbs = wsRaw ? path.resolve(wsRaw) : undefined;
  const taskDir = instance.taskDir ? path.resolve(instance.taskDir) : undefined;

  if (scope === 'artifacts') {
    const allowedRoots = [wsAbs, taskDir].filter((x): x is string => !!x);
    const seen = new Set<string>();
    for (const art of instance.artifactRegistry ?? []) {
      if (art.existedBefore) {
        continue;
      }
      if (!path.isAbsolute(art.filePath)) {
        out.rejected.push({ path: art.filePath, reason: 'not-absolute' });
        continue;
      }
      const abs = path.normalize(art.filePath);
      if (allowedRoots.length > 0 && !allowedRoots.some((r) => isUnder(r, abs))) {
        out.rejected.push({ path: abs, reason: 'outside-task-roots' });
        continue;
      }
      if (!seen.has(abs)) {
        seen.add(abs);
        out.files.push(abs);
      }
    }
    if (wsAbs) {
      for (const name of [REQUIREMENT_DOC_FILE, WORKFLOW_PLAN_DOC_FILE]) {
        const abs = path.join(wsAbs, name);
        if (!seen.has(abs)) {
          seen.add(abs);
          out.files.push(abs);
        }
      }
    }
    return out;
  }

  if (!wsAbs) {
    out.rejected.push({ path: wsRaw ?? '(unset)', reason: 'no-task-workspace-path' });
    return out;
  }
  if (path.parse(wsAbs).root === wsAbs) {
    out.rejected.push({ path: wsAbs, reason: 'is-filesystem-root' });
    return out;
  }
  if (opts.homeDir && path.resolve(opts.homeDir) === wsAbs) {
    out.rejected.push({ path: wsAbs, reason: 'is-home-dir' });
    return out;
  }
  if (segDepth(wsAbs) < (opts.minFolderDepth ?? 2)) {
    out.rejected.push({ path: wsAbs, reason: 'path-too-shallow' });
    return out;
  }
  out.dirs.push(wsAbs);
  return out;
}
