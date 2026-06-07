import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import {
  expandUserHomePath,
  getReadableProjectRoots,
  pickZoomOutFilePath,
  resolveExistingDirectoryPath,
  resolveInitialTaskDir,
  resolveWorkspaceRootAbsolute,
  safeJoinUnderWorkspaceRoot,
} from '../WorkflowPathResolver';
import { taskInstanceDir } from '../paths/StagentPaths';
import type { WorkflowDefinition } from '../WorkflowDefinition';

test('expandUserHomePath expands ~ and ~/x, leaves others', () => {
  assert.equal(expandUserHomePath('~'), os.homedir());
  assert.equal(expandUserHomePath('~/proj'), path.join(os.homedir(), 'proj'));
  assert.equal(expandUserHomePath('/abs/path'), '/abs/path');
  assert.equal(expandUserHomePath('  relative  '), 'relative');
});

test('resolveExistingDirectoryPath rejects empty and missing', () => {
  const empty = resolveExistingDirectoryPath('   ');
  assert.equal(empty.ok, false);
  const missing = resolveExistingDirectoryPath('/no/such/dir/xyz-123');
  assert.equal(missing.ok, false);
});

test('resolveExistingDirectoryPath accepts an existing directory', () => {
  const res = resolveExistingDirectoryPath(os.tmpdir());
  assert.equal(res.ok, true);
  assert.equal((res as { ok: true; abs: string }).abs, path.resolve(os.tmpdir()));
});

test('resolveInitialTaskDir uses taskWorkspacePath when valid', () => {
  const wf = {
    meta: { taskWorkspacePath: os.tmpdir() },
  } as unknown as WorkflowDefinition;
  const res = resolveInitialTaskDir('inst1', wf, undefined, '/global/storage');
  assert.equal(res.ok, true);
  assert.equal(
    (res as { ok: true; dir: string }).dir,
    taskInstanceDir(path.resolve(os.tmpdir()), 'inst1'),
  );
});

test('resolveInitialTaskDir fails without workspace and without taskWorkspacePath', () => {
  const wf = { meta: {} } as unknown as WorkflowDefinition;
  const res = resolveInitialTaskDir('inst1', wf, undefined, '/global/storage');
  assert.equal(res.ok, false);
});

test('resolveInitialTaskDir falls back to workspace root', () => {
  const wf = { meta: {} } as unknown as WorkflowDefinition;
  const res = resolveInitialTaskDir('inst1', wf, '/ws/root', '/global/storage');
  assert.equal(res.ok, true);
  assert.ok((res as { ok: true; dir: string }).dir.includes('inst1'));
});

test('resolveWorkspaceRootAbsolute resolves ~ and returns undefined when empty', () => {
  assert.equal(resolveWorkspaceRootAbsolute(undefined), undefined);
  assert.equal(resolveWorkspaceRootAbsolute('   '), undefined);
  assert.equal(resolveWorkspaceRootAbsolute('/a/b'), path.resolve('/a/b'));
});

test('safeJoinUnderWorkspaceRoot blocks .. escape and joins valid', () => {
  assert.equal(safeJoinUnderWorkspaceRoot('/root', 'sub/x.txt'), path.resolve('/root', 'sub/x.txt'));
  assert.throws(
    () => safeJoinUnderWorkspaceRoot('/root', '../escape.txt'),
    /逃出工作区根目录|Path escapes workspace root/i,
  );
});

test('safeJoinUnderWorkspaceRoot allows real paths under a symlinked-temp root', () => {
  // macOS 的 os.tmpdir() 常是 /var/folders/... → realpath /private/var/...，两侧需一致才不误判。
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'safejoin-root-'));
  try {
    const out = safeJoinUnderWorkspaceRoot(root, 'sub/out.txt');
    assert.equal(out, path.resolve(root, 'sub/out.txt'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('safeJoinUnderWorkspaceRoot blocks symlink that escapes the workspace root', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'safejoin-link-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'safejoin-outside-'));
  try {
    // <root>/link -> <outside> （词法上 link/secret.txt 仍在 root 下，但 realpath 在 root 外）
    fs.symlinkSync(outside, path.join(root, 'link'));
    assert.throws(
      () => safeJoinUnderWorkspaceRoot(root, 'link/secret.txt'),
      /逃出工作区根目录|Path escapes workspace root/i,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('safeJoinUnderWorkspaceRoot blocks a target that is itself an escaping symlink', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'safejoin-target-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'safejoin-target-out-'));
  try {
    const victim = path.join(outside, 'passwd');
    fs.writeFileSync(victim, 'secret');
    fs.symlinkSync(victim, path.join(root, 'passwd'));
    assert.throws(
      () => safeJoinUnderWorkspaceRoot(root, 'passwd'),
      /逃出工作区根目录|Path escapes workspace root/i,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('safeJoinUnderWorkspaceRoot allows an in-workspace symlink that stays under root', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'safejoin-inlink-'));
  try {
    fs.mkdirSync(path.join(root, 'real'));
    fs.symlinkSync(path.join(root, 'real'), path.join(root, 'alias'));
    const out = safeJoinUnderWorkspaceRoot(root, 'alias/file.txt');
    assert.equal(out, path.resolve(root, 'alias/file.txt'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('getReadableProjectRoots includes workspace root and cwd, deduped', () => {
  const roots = getReadableProjectRoots('/ws');
  assert.ok(roots.includes('/ws'));
  assert.ok(roots.includes(process.cwd()));
  const noWs = getReadableProjectRoots(undefined);
  assert.ok(noWs.includes(process.cwd()));
});

test('pickZoomOutFilePath returns first existing candidate, else fallback', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zoomout-'));
  fs.writeFileSync(path.join(tmpRoot, 'tsconfig.json'), '{}');
  assert.equal(pickZoomOutFilePath([tmpRoot]), 'tsconfig.json');
  const emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zoomout-empty-'));
  assert.equal(pickZoomOutFilePath([emptyRoot]), 'package.json');
  assert.equal(pickZoomOutFilePath([emptyRoot], 'custom.txt'), 'custom.txt');
});
