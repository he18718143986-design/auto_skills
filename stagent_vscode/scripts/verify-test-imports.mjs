#!/usr/bin/env node
/**
 * 校验测试文件中的相对 import 是否在工作区存在（供 stage_verify_imports_* code-runner 使用）。
 * 用法：node scripts/verify-test-imports.mjs <test-file> [test-file...]
 * 退出码 0=通过，1=存在缺失路径。
 */
import fs from 'node:fs';
import path from 'node:path';

const IMPORT_RE =
  /import\s+(?:type\s+)?(?:[\w*{}\s,]+\s+from\s+)?['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function extractRelativeSpecs(content) {
  const specs = new Set();
  IMPORT_RE.lastIndex = 0;
  let m;
  while ((m = IMPORT_RE.exec(content)) !== null) {
    const spec = m[1] || m[2];
    if (spec && spec.startsWith('.')) {
      specs.add(spec);
    }
  }
  return [...specs];
}

function resolveImport(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
    path.join(base, 'index.js'),
  ];
  return candidates.find((p) => fs.existsSync(p));
}

function checkTestFile(testPath) {
  const abs = path.resolve(testPath);
  if (!fs.existsSync(abs)) {
    return { file: testPath, missing: [`<file not found: ${testPath}>`] };
  }
  const content = fs.readFileSync(abs, 'utf8');
  const missing = [];
  for (const spec of extractRelativeSpecs(content)) {
    if (!resolveImport(abs, spec)) {
      missing.push(spec);
    }
  }
  return { file: testPath, missing };
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: node scripts/verify-test-imports.mjs <test-file> [...]');
  process.exit(2);
}

let failed = false;
for (const f of files) {
  const { file, missing } = checkTestFile(f);
  if (missing.length === 0) {
    console.log(`OK ${file}`);
    continue;
  }
  failed = true;
  console.error(`FAIL ${file}`);
  for (const spec of missing) {
    console.error(`  missing import target: ${spec}`);
  }
}

process.exit(failed ? 1 : 0);
