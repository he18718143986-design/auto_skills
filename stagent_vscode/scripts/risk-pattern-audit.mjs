#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SCAN_DIRS = ['src', 'scripts'];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'out') continue;
      walk(full, out);
    } else if (/\.(ts|tsx|js|mjs)$/.test(e.name) && !e.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

function lineOf(code, idx) {
  return code.slice(0, idx).split(/\r?\n/).length;
}

function extractCatchBody(code, catchStart) {
  const brace = code.indexOf('{', catchStart);
  if (brace < 0) return null;
  let depth = 0;
  for (let i = brace; i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}') {
      depth--;
      if (depth === 0) return { body: code.slice(brace + 1, i), end: i, line: lineOf(code, brace) };
    }
  }
  return null;
}

function isWeakCatch(body) {
  const trimmed = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').trim();
  if (!trimmed) return { weak: true, reason: 'empty catch' };
  // remove comments-only
  const stmts = trimmed
    .split(/;|\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (stmts.length === 0) return { weak: true, reason: 'empty catch' };
  const onlyLogOrThrow = stmts.every((s) => {
    if (/^throw\s/.test(s)) return true;
    if (/^console\.(log|debug|info|warn|error)\(/.test(s)) return true;
    if (/^void\s+console\./.test(s)) return true;
    return false;
  });
  if (onlyLogOrThrow && stmts.some((s) => /^throw\s/.test(s))) {
    return { weak: true, reason: 'only rethrow' };
  }
  if (onlyLogOrThrow && stmts.every((s) => /console\./.test(s))) {
    return { weak: true, reason: 'only console.*' };
  }
  // single throw only
  if (stmts.length === 1 && /^throw\s/.test(stmts[0])) {
    return { weak: true, reason: 'only rethrow' };
  }
  return { weak: false };
}

function findWeakCatches(code, rel) {
  const hits = [];
  const re = /catch\s*(?:\(\s*([^)]*)\s*\))?\s*/g;
  let m;
  while ((m = re.exec(code))) {
    const extracted = extractCatchBody(code, m.index);
    if (!extracted) continue;
    const { weak, reason } = isWeakCatch(extracted.body);
    if (weak) {
      hits.push({ file: rel, line: lineOf(code, m.index), reason, preview: extracted.body.trim().slice(0, 120) });
    }
  }
  return hits;
}

function findAsyncWithoutHandling(code, rel) {
  const hits = [];
  const lines = code.split(/\r?\n/);

  // async function / async () =>
  const asyncFnRe = /(?:export\s+)?async\s+function\s+(\w+)|(?:export\s+)?const\s+(\w+)\s*=\s*async\s*\(|(\w+)\s*:\s*\([^)]*\)\s*=>\s*async|async\s+(\w+)\s*\(/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const ln = i + 1;

    // void foo().catch - OK
    // await inside try - check later

    // fire-and-forget: void something async without .catch on same line
    const voidMatch = line.match(/^\s*void\s+(.+);?\s*$/);
    if (voidMatch) {
      const expr = voidMatch[1];
      if (
        (/\basync\b/.test(expr) || /\.then\(/.test(expr) || /\w+\([^)]*\)/.test(expr)) &&
        !/\.catch\s*\(/.test(line) &&
        !/\.finally\s*\(/.test(line)
      ) {
        // check if callee is known async method
        if (
          /\(/.test(expr) &&
          !/console\.|vscode\.window\.show/.test(expr)
        ) {
          // look ahead for .catch on next lines (chained)
          const next3 = lines.slice(i, i + 3).join(' ');
          if (!/\.catch\s*\(/.test(next3)) {
            hits.push({ file: rel, line: ln, kind: 'void-without-catch', expr: expr.slice(0, 80) });
          }
        }
      }
    }

    // bare promise .then without .catch (single line)
    if (/\.then\s*\(/.test(line) && !/\.catch\s*\(/.test(line)) {
      const next5 = lines.slice(i, Math.min(i + 6, lines.length)).join(' ');
      if (!/\.catch\s*\(/.test(next5)) {
        hits.push({ file: rel, line: ln, kind: 'then-without-catch', expr: line.trim().slice(0, 100) });
      }
    }
  }

  // async function bodies without try/catch at top level - heuristic: long async with await but no try
  const asyncBlockRe = /async\s+function\s+(\w+)\s*\([^)]*\)\s*(?::[^{]+)?\{/g;
  let m;
  while ((m = asyncBlockRe.exec(code))) {
    const name = m[1];
    const start = m.index;
    const line = lineOf(code, start);
    const brace = code.indexOf('{', start);
    const body = extractCatchBody(code, brace - 5 + 'catch'.length); // wrong
    let depth = 0;
    let bodyStr = '';
    for (let i = brace; i < code.length; i++) {
      if (code[i] === '{') depth++;
      else if (code[i] === '}') {
        depth--;
        if (depth === 0) {
          bodyStr = code.slice(brace + 1, i);
          break;
        }
      }
    }
    if (!bodyStr.includes('await ') || bodyStr.includes('try {')) continue;
    const awaitCount = (bodyStr.match(/\bawait\b/g) || []).length;
    if (awaitCount >= 2 && !bodyStr.includes('try {') && !bodyStr.includes('.catch(')) {
      hits.push({ file: rel, line, kind: 'async-fn-no-try', name, awaitCount });
    }
  }

  return hits;
}

const EXTERNAL = {
  llm: [
    /\bselectChatModels\b/,
    /\bLanguageModelChat\b/,
    /\bDirectHttpLmModel\b/,
    /\bfetch\s*\(/,
    /\brequest\.end\b/,
    /\bSseDeltaStream\b/,
    /\bcompletions\b/,
    /\binvokeLlm\b/i,
    /\bexecuteStageLlm\b/,
  ],
  fs: [/\bfsp?\.\w+\(/, /\bfs\.promises\./, /\bfs\.(read|write|append|mkdir|rm|unlink)/, /\breadTextFile\b/, /\bwriteTextFile\b/, /\bwriteFileSync\b/],
  subprocess: [/\bchild_process\b/, /\bspawn\s*\(/, /\bexec\s*\(/, /\bexecFile\s*\(/, /\bSandboxExecutor\b/, /\brunCommand\b/],
};

function hasTimeoutNearby(code, idx, window = 400) {
  const slice = code.slice(Math.max(0, idx - window), idx + window);
  return (
    /\btimeout\b/i.test(slice) ||
    /\bAbortSignal\b/.test(slice) ||
    /\babortController\b/i.test(slice) ||
    /\bsetTimeout\b/.test(slice) ||
    /\bwithTimeout\b/.test(slice) ||
    /\btimeoutMs\b/.test(slice) ||
    /\btimeoutSeconds\b/.test(slice) ||
    /\bLLM.*timeout/i.test(slice) ||
    /\breadEngine.*[Tt]imeout/.test(slice) ||
    /\bresolveCodeRunnerTimeout\b/.test(slice) ||
    /\bSandboxExecutor\b/.test(slice)
  );
}

function findExternalWithoutTimeout(code, rel) {
  const hits = [];
  for (const [kind, patterns] of Object.entries(EXTERNAL)) {
    for (const p of patterns) {
      let m;
      const re = new RegExp(p.source, p.flags + (p.global ? '' : 'g'));
      while ((m = re.exec(code))) {
        if (hasTimeoutNearby(code, m.index)) continue;
        // skip test files for some
        if (rel.includes('/test/') && kind === 'fs') continue;
        // skip type-only imports
        const line = code.split(/\r?\n/)[lineOf(code, m.index) - 1] || '';
        if (/^\s*import\s+type\b/.test(line)) continue;
        hits.push({ file: rel, line: lineOf(code, m.index), kind, match: m[0] });
      }
    }
  }
  // dedupe close lines
  const deduped = [];
  for (const h of hits) {
    if (deduped.some((d) => d.file === h.file && Math.abs(d.line - h.line) < 3 && d.kind === h.kind)) continue;
    deduped.push(h);
  }
  return deduped;
}

function findNonAtomicJsonWrites(code, rel) {
  const hits = [];
  const lines = code.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const ln = i + 1;
    const isJsonWrite =
      (/writeFileSync\s*\(/.test(line) || /\.writeFile\s*\(/.test(line)) &&
      (/JSON\.stringify/.test(line) || /\.json['"]/.test(line) || /index\.json/.test(line) || /\.wf-state/.test(line));

    if (!isJsonWrite) continue;

    const context = lines.slice(Math.max(0, i - 15), i + 5).join('\n');
    const hasAtomic =
      /atomicWriteTextFile/.test(context) ||
      (/\.tmp-/.test(context) && /rename/.test(context)) ||
      (/tmpPath/.test(context) && /rename/.test(context));

    if (!hasAtomic) {
      hits.push({ file: rel, line: ln, code: line.trim().slice(0, 100) });
    }
  }

  // appendFileSync jsonl - note separately
  for (let i = 0; i < lines.length; i++) {
    if (/appendFileSync\s*\(/.test(lines[i]) && /JSON\.stringify/.test(lines[i])) {
      const ctx = lines.slice(Math.max(0, i - 5), i + 3).join('\n');
      if (!/atomic/.test(ctx)) {
        hits.push({
          file: rel,
          line: i + 1,
          code: lines[i].trim().slice(0, 100),
          note: 'append-only jsonl (not full replace)',
        });
      }
    }
  }

  // writeTextFile without atomic in same function - harder
  if (/writeTextFile\s*\(/.test(code) && !rel.includes('test/')) {
    const re = /await\s+writeTextFile\s*\(/g;
    let m;
    while ((m = re.exec(code))) {
      const before = code.slice(Math.max(0, m.index - 600), m.index);
      if (/atomicWriteTextFile/.test(before.slice(-200))) continue;
      const fnChunk = before.slice(-600);
      if (!/\.tmp|tmpPath|rename/.test(fnChunk)) {
        hits.push({ file: rel, line: lineOf(code, m.index), code: 'await writeTextFile(...)', note: 'non-atomic async write' });
      }
    }
  }

  return hits;
}

const files = SCAN_DIRS.flatMap((d) => walk(path.join(ROOT, d)));
const weakCatches = [];
const asyncIssues = [];
const timeoutIssues = [];
const atomicIssues = [];

for (const f of files) {
  const rel = path.relative(ROOT, f).replace(/\\/g, '/');
  const code = fs.readFileSync(f, 'utf8');
  weakCatches.push(...findWeakCatches(code, rel));
  if (!rel.includes('/test/')) {
    asyncIssues.push(...findAsyncWithoutHandling(code, rel));
  }
  timeoutIssues.push(...findExternalWithoutTimeout(code, rel));
  atomicIssues.push(...findNonAtomicJsonWrites(code, rel));
}

// dedupe atomic
const atomicDedup = [];
for (const h of atomicIssues) {
  const k = `${h.file}:${h.line}:${h.code}`;
  if (!atomicDedup.some((x) => `${x.file}:${x.line}` === `${h.file}:${h.line}`)) atomicDedup.push(h);
}

console.log(JSON.stringify({ weakCatches, asyncIssues, timeoutIssues, atomicIssues: atomicDedup }, null, 2));
