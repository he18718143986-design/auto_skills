#!/usr/bin/env node
/**
 * One-off project scan: line counts, import graph, circular deps.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SKIP_DIRS = new Set([
  'node_modules',
  'out',
  '.git',
  '.vscode-test',
  'dist',
  'coverage',
]);
const EXT_SOURCE = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs']);
const EXT_ALL = new Set([
  ...EXT_SOURCE,
  '.json',
  '.md',
  '.css',
  '.html',
  '.yml',
  '.yaml',
  '.svg',
]);

function walk(dir, files = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.github' && e.name !== '.c8rc.json') {
      if (e.isDirectory() && !['.github'].includes(e.name)) continue;
    }
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      if (e.name === '.cursor') continue;
      walk(full, files);
    } else {
      const ext = path.extname(e.name);
      if (!EXT_ALL.has(ext) && ext !== '') continue;
      if (e.name.endsWith('.lock')) continue;
      files.push(full);
    }
  }
  return files;
}

function lineCount(filePath) {
  const buf = fs.readFileSync(filePath, 'utf8');
  if (!buf) return 0;
  return buf.split(/\r?\n/).length;
}

function guessRole(filePath, content) {
  const rel = path.relative(ROOT, filePath).replace(/\\/g, '/');
  const base = path.basename(filePath, path.extname(filePath));

  const fileDoc = content.match(/^\/\*\*([\s\S]*?)\*\//)?.[1];
  if (fileDoc) {
    const line = fileDoc
      .split('\n')
      .map((l) => l.replace(/^\s*\*\s?/, '').trim())
      .find((l) => l && !l.startsWith('@'));
    if (line && line.length < 120) return line;
  }

  const modDoc = content.match(/^\/\/\s*(.+)/m)?.[1];
  if (modDoc && modDoc.length < 120 && !modDoc.includes('http')) return modDoc;

  if (rel.startsWith('src/test/') || rel.includes('.test.'))
    return `${base} 的单元/集成测试。`;
  if (rel.startsWith('prompts/')) return `LLM 提示词模板：${base}。`;
  if (rel.startsWith('docs/')) return `项目文档：${base}。`;
  if (rel.startsWith('scripts/fixtures/')) return `Rule20/校验夹具：${rel.split('/').slice(-2).join('/')}。`;
  if (rel.startsWith('scripts/')) return `构建/校验脚本：${base}。`;
  if (rel.startsWith('schemas/')) return `JSON Schema：${base}。`;
  if (rel.startsWith('examples/')) return `示例：${base}。`;
  if (rel.startsWith('.github/')) return `CI 工作流或 GitHub 配置。`;
  if (rel === 'src/extension.ts') return 'VS Code 扩展激活入口与命令注册。';
  if (rel.startsWith('src/webview/')) return `Webview 前端（${path.dirname(rel).split('/').pop()}）：${base}。`;
  if (rel.startsWith('src/rule20/')) return `Rule20 校验规则：${base}。`;
  if (rel.startsWith('src/engine-host/')) return `WorkflowEngine Host 依赖切片：${base}。`;
  if (rel.startsWith('src/stage-runners/')) return `阶段执行管线：${base}。`;
  if (rel.startsWith('src/generated/')) return `构建生成物：${base}。`;
  if (rel.startsWith('src/workflow-templates/')) return `工作流模板：${base}。`;

  const exportMatch = content.match(
    /export\s+(?:async\s+)?(?:function|class|const|interface|type|enum)\s+(\w+)/,
  );
  if (exportMatch) {
    const name = exportMatch[1];
    if (/Engine|Coordinator|Provider|Manager|Runner|Gate|Lint|Bridge|Host|Store|Registry/i.test(name))
      return `导出 ${name}，承担对应领域编排或策略。`;
    return `导出 ${name} 及相关类型/工具。`;
  }

  return `模块 ${base}（路径 ${path.dirname(rel)}）。`;
}

const IMPORT_RE =
  /(?:import|export)\s+(?:type\s+)?(?:[\w*{}\s,]+\s+from\s+)?['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function resolveImport(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const dir = path.dirname(fromFile);
  let target = path.resolve(dir, spec);
  const tryExts = ['', '.ts', '.tsx', '.js', '.mjs', '/index.ts', '/index.js'];
  for (const suf of tryExts) {
    const p = suf.startsWith('/') ? target + suf : target + suf;
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return path.normalize(p);
  }
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    for (const idx of ['index.ts', 'index.tsx', 'index.js']) {
      const p = path.join(target, idx);
      if (fs.existsSync(p)) return path.normalize(p);
    }
  }
  return path.normalize(target + '.ts');
}

function buildGraph(tsFiles) {
  const graph = new Map();
  for (const f of tsFiles) graph.set(f, new Set());
  for (const f of tsFiles) {
    const content = fs.readFileSync(f, 'utf8');
    let m;
    IMPORT_RE.lastIndex = 0;
    while ((m = IMPORT_RE.exec(content))) {
      const spec = m[1] || m[2];
      if (!spec?.startsWith('.')) continue;
      const resolved = resolveImport(f, spec);
      if (resolved && graph.has(resolved)) graph.get(f).add(resolved);
    }
  }
  return graph;
}

function findCycles(graph) {
  const cycles = [];
  const seen = new Set();
  const stack = [];
  const inStack = new Set();
  const pathIndex = new Map();

  function reportCycle(startIdx) {
    const cycle = stack.slice(startIdx).map((p) => path.relative(ROOT, p).replace(/\\/g, '/'));
    cycle.push(cycle[0]);
    const key = [...cycle].sort().join('→');
    if (!cycles.some((c) => c.key === key)) cycles.push({ key, cycle });
  }

  function dfs(node) {
    if (inStack.has(node)) {
      reportCycle(pathIndex.get(node));
      return;
    }
    if (seen.has(node)) return;
    seen.add(node);
    inStack.add(node);
    pathIndex.set(node, stack.length);
    stack.push(node);
    for (const nxt of graph.get(node) || []) dfs(nxt);
    stack.pop();
    inStack.delete(node);
    pathIndex.delete(node);
  }

  for (const n of graph.keys()) dfs(n);
  return cycles;
}

function mergeCycles(cycles) {
  const edges = new Set();
  for (const { cycle } of cycles) {
    for (let i = 0; i < cycle.length - 1; i++) {
      edges.add(`${cycle[i]}→${cycle[i + 1]}`);
    }
  }
  const pairs = new Map();
  for (const e of edges) {
    const [a, b] = e.split('→');
    const rev = `${b}→${a}`;
    if (edges.has(rev)) {
      const k = [a, b].sort().join(' ↔ ');
      pairs.set(k, [a, b]);
    }
  }
  const simple = [...pairs.values()].map(([a, b]) => ({ a, b }));
  const longer = cycles
    .filter((c) => c.cycle.length > 3)
    .map((c) => c.cycle.join(' → '));
  return { pairs: simple, longer: [...new Set(longer)] };
}

const allFiles = walk(ROOT).sort((a, b) =>
  path.relative(ROOT, a).localeCompare(path.relative(ROOT, b)),
);

const rows = [];
for (const f of allFiles) {
  const content = fs.readFileSync(f, 'utf8');
  rows.push({
    path: path.relative(ROOT, f).replace(/\\/g, '/'),
    lines: lineCount(f),
    role: guessRole(f, content).replace(/\|/g, '\\|').replace(/\n/g, ' '),
  });
}

const tsFiles = allFiles.filter((f) => EXT_SOURCE.has(path.extname(f)) && !f.includes('/test/'));
const graph = buildGraph(
  allFiles.filter(
    (f) =>
      EXT_SOURCE.has(path.extname(f)) &&
      f.includes(path.join(ROOT, 'src')),
  ),
);

const refCount = new Map();
for (const [from, deps] of graph) {
  for (const to of deps) {
    refCount.set(to, (refCount.get(to) || 0) + 1);
  }
}
const topRefs = [...refCount.entries()]
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  .slice(0, 10)
  .map(([f, n]) => ({
    path: path.relative(ROOT, f).replace(/\\/g, '/'),
    count: n,
    role: guessRole(f, fs.readFileSync(f, 'utf8')).replace(/\|/g, '\\|').slice(0, 80),
  }));

const over500 = rows.filter((r) => r.lines > 500).sort((a, b) => b.lines - a.lines);
const cycles = findCycles(graph);
const { pairs, longer } = mergeCycles(cycles);

const outPath = path.join(ROOT, 'scripts', 'project-scan-output.json');
fs.writeFileSync(
  outPath,
  JSON.stringify({ rows, over500, topRefs, pairs, longer, totalFiles: rows.length }, null, 2),
);
console.log('WROTE', outPath);
console.log('FILES', rows.length);
console.log('OVER500', over500.length);
console.log('CYCLES_PAIRS', pairs.length, 'LONGER', longer.length);
