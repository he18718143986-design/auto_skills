#!/usr/bin/env node
/**
 * 校验 Python 测试文件的顶层 module import 是否在工作区存在。
 * 用法：node scripts/verify-python-test-imports.mjs <test-file> [test-file...]
 * 退出码 0=通过，1=存在缺失模块。
 */
import fs from 'node:fs';
import path from 'node:path';
import externalRoots from './python-external-module-roots.json' with { type: 'json' };

const FROM_IMPORT_RE = /^\s*from\s+([a-zA-Z_][\w.]*)\s+import\s+/gm;
const IMPORT_RE = /^\s*import\s+([a-zA-Z_][\w.]*)\s*$/gm;

/** 标准库 + 常见第三方：与 pythonExternalModules.ts 共享 SSOT */
const EXTERNAL_MODULE_ROOTS = new Set(externalRoots.map((r) => r.toLowerCase()));

function isExternalModuleRoot(name) {
  return EXTERNAL_MODULE_ROOTS.has(name.split('.')[0].toLowerCase());
}

function extractModuleImports(content) {
  const mods = new Set();
  FROM_IMPORT_RE.lastIndex = 0;
  let m;
  while ((m = FROM_IMPORT_RE.exec(content)) !== null) {
    const mod = m[1];
    if (mod && !mod.startsWith('.')) {
      mods.add(mod.split('.')[0]);
    }
  }
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(content)) !== null) {
    const mod = m[1];
    if (mod && !mod.startsWith('.')) {
      mods.add(mod.split('.')[0]);
    }
  }
  return [...mods];
}

function resolveModule(workspaceRoot, mod) {
  const candidates = [
    path.join(workspaceRoot, `${mod}.py`),
    path.join(workspaceRoot, mod, '__init__.py'),
    path.join(workspaceRoot, 'src', `${mod}.py`),
    path.join(workspaceRoot, 'src', mod, '__init__.py'),
  ];
  return candidates.find((p) => fs.existsSync(p));
}

function checkTestFile(testPath, workspaceRoot) {
  const abs = path.resolve(testPath);
  if (!fs.existsSync(abs)) {
    return { file: testPath, missing: [`<file not found: ${testPath}>`] };
  }
  const content = fs.readFileSync(abs, 'utf8');
  const missing = [];
  for (const mod of extractModuleImports(content)) {
    if (isExternalModuleRoot(mod)) {
      continue;
    }
    if (!resolveModule(workspaceRoot, mod)) {
      missing.push(mod);
    }
  }
  return { file: testPath, missing };
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: node scripts/verify-python-test-imports.mjs <test-file> [...]');
  process.exit(2);
}

const workspaceRoot = process.cwd();
const results = files.map((f) => checkTestFile(f, workspaceRoot));
const allMissing = results.flatMap((r) => r.missing.map((m) => `${r.file}: ${m}`));

if (allMissing.length > 0) {
  console.error('Missing Python modules:');
  for (const line of allMissing) {
    console.error(`  ${line}`);
  }
  process.exit(1);
}

console.log('All Python test module imports resolved.');
process.exit(0);
