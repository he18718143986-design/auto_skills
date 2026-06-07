#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'src');

const CONCERNS = {
  ui: [
    /\bwebview\b/i,
    /\bvscode\.window\b/,
    /\bpostMessage\b/,
    /\bWebviewPanel\b/,
    /\bescapeHtml\b/,
    /\bregisterWebview\b/,
    /\bshowTextDocument\b/,
    /\bcreateWebview\b/i,
    /document\.getElementById/,
    /\binnerHTML\b/,
  ],
  llm: [
    /\bLlmClient\b/,
    /\bllm-text\b/,
    /\bselectChatModels\b/,
    /\bcompletions\b/,
    /\bOpenAiCompatible\b/,
    /\bSseDeltaStream\b/,
    /\bsystemPrompt\b/,
    /\bWorkflowPrompts\b/,
    /\bPromptFragments\b/,
    /\binvokeLlm\b/i,
    /\bstreamLlm\b/i,
  ],
  fs: [
    /\bfs\.(read|write|exists|mkdir|unlink|rm)\b/,
    /\breadTextFile\b/,
    /\bwriteTextFile\b/,
    /\batomicWrite\b/,
    /\bpersistInstance\b/,
    /\bWorkflowPersistence\b/,
    /\b\.wf-state\.json\b/,
    /\bensureDir\b/,
    /\bpathExists\b/,
  ],
  exec: [
    /\bWorkflowExecutor\b/,
    /\bexecuteStage\b/,
    /\bcode-runner\b/,
    /\bWorkflowCodeRunnerHost\b/,
    /\bchild_process\b/,
    /\bspawn\b/,
    /\bDAG\b/,
    /\bpickDagExecutionBatch\b/,
  ],
  persist: [
    /\bglobalState\b/,
    /\bWorkflowInstanceRepository\b/,
    /\bArtifactLifecycle\b/,
    /\bexperiences\.jsonl\b/,
    /\bCONTEXT\.md\b/,
  ],
  gate: [
    /\bQualityGate\b/,
    /\bverifyRule20\b/,
    /\bRule20\b/,
    /\bLint\b/,
    /\bGateResult\b/,
  ],
  msg: [
    /\bFrontendMessage\b/,
    /\bBackendMessage\b/,
    /\bisFrontendMessage\b/,
    /\brouteWorkflowPanelMessage\b/,
    /\bregisterMessageHandler\b/,
  ],
};

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|mjs)$/.test(e.name) && !e.name.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

function stripComments(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

function countClassMethods(code, fileRel) {
  const results = [];
  // export class Foo { ... }
  const classRe = /export\s+(?:abstract\s+)?class\s+(\w+)[^{]*\{/g;
  let m;
  while ((m = classRe.exec(code))) {
    const className = m[1];
    const start = m.index + m[0].length - 1;
    const body = extractBraced(code, start);
    if (!body) continue;
    const methods = countMethodsInClassBody(body);
    if (methods.length > 20) {
      results.push({ file: fileRel, className, methodCount: methods.length, methods: methods.slice(0, 30) });
    }
  }
  return results;
}

function extractBraced(code, openIdx) {
  if (code[openIdx] !== '{') return null;
  let depth = 0;
  for (let i = openIdx; i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}') {
      depth--;
      if (depth === 0) return code.slice(openIdx + 1, i);
    }
  }
  return null;
}

function countMethodsInClassBody(body) {
  const methods = [];
  // method patterns at class body level (heuristic)
  const re =
    /(?:^|\n)\s*(?:(?:public|private|protected|static|async|override)\s+)*(\w+)\s*\([^)]*\)\s*(?::[^{]+)?\{/g;
  let m;
  const reserved = new Set(['if', 'for', 'while', 'switch', 'catch', 'constructor']);
  while ((m = re.exec(body))) {
    const name = m[1];
    if (reserved.has(name) || name === 'function') continue;
    methods.push(name);
  }
  // constructor
  if (/\bconstructor\s*\(/.test(body)) methods.push('constructor');
  return [...new Set(methods)];
}

function countObjectLiteralMethods(code, fileRel) {
  const results = [];
  // export const foo = { bar() {}, ... }  or large object returns
  const objRe = /export\s+(?:const|function)\s+(\w+)\s*=\s*\{/g;
  let m;
  while ((m = objRe.exec(code))) {
    const name = m[1];
    const start = m.index + m[0].length - 1;
    const body = extractBraced(code, start);
    if (!body || body.length < 500) continue;
    const methods = [...body.matchAll(/(\w+)\s*\([^)]*\)\s*(?::[^{]+)?\{/g)].map((x) => x[1]);
    const uniq = [...new Set(methods)].filter((n) => !['if', 'for', 'while'].includes(n));
    if (uniq.length > 20) {
      results.push({ file: fileRel, objectName: name, methodCount: uniq.length });
    }
  }
  return results;
}

function findLongFunctions(code, fileRel) {
  const results = [];
  const fnPatterns = [
    /export\s+(?:async\s+)?function\s+(\w+)/g,
    /(?:async\s+)?function\s+(\w+)\s*\(/g,
    /export\s+const\s+(\w+)\s*=\s*(?:async\s+)?\(/g,
    /(\w+)\s*:\s*(?:async\s+)?function\s*\(/g,
    /(\w+)\s*=\s*(?:async\s+)?function\s*\(/g,
    /(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/g,
  ];

  const lines = code.split(/\r?\n/);

  // Find function starts with line numbers
  const starts = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*export\s+(?:async\s+)?function\s+\w+/.test(line)) {
      const name = line.match(/function\s+(\w+)/)?.[1];
      starts.push({ line: i + 1, name, kind: 'function' });
    } else if (/^\s*(?:export\s+)?(?:async\s+)?function\s+\w+/.test(line) && !/^\s*export\s+class/.test(line)) {
      const name = line.match(/function\s+(\w+)/)?.[1];
      if (name) starts.push({ line: i + 1, name, kind: 'function' });
    } else if (/^\s*export\s+const\s+(\w+)\s*=\s*(?:async\s+)?\(/.test(line)) {
      const name = line.match(/const\s+(\w+)/)?.[1];
      starts.push({ line: i + 1, name, kind: 'arrow' });
    } else if (/^\s*(\w+)\s*\([^)]*\)\s*\{/.test(line) && /^\s{2,}/.test(line)) {
      const name = line.match(/^\s*(\w+)\s*\(/)?.[1];
      if (name && !['if', 'for', 'while', 'switch', 'catch'].includes(name))
        starts.push({ line: i + 1, name, kind: 'method?' });
    }
  }

  // Better: brace matching from export function
  const exportFnRe = /export\s+(async\s+)?function\s+(\w+)/g;
  let m;
  while ((m = exportFnRe.exec(code))) {
    const name = m[2];
    const lineNum = code.slice(0, m.index).split(/\n/).length;
    const braceStart = code.indexOf('{', m.index);
    if (braceStart < 0) continue;
    const body = extractBraced(code, braceStart);
    if (!body) continue;
    const fnLines = body.split(/\n/).length + 2; // rough
    const endLine = lineNum + fnLines;
    if (fnLines > 80) {
      results.push({ file: fileRel, name, startLine: lineNum, lines: fnLines, kind: 'export function' });
    }
  }

  // class methods
  const methodRe = /^\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::[^{]+)?\{/gm;
  while ((m = methodRe.exec(code))) {
    const name = m[1];
    if (['if', 'for', 'while', 'switch', 'catch'].includes(name)) continue;
    const lineNum = code.slice(0, m.index).split(/\n/).length;
    const braceStart = code.indexOf('{', m.index);
    const body = extractBraced(code, braceStart);
    if (!body) continue;
    const fnLines = body.split(/\n/).length + 1;
    if (fnLines > 80) {
      results.push({ file: fileRel, name, startLine: lineNum, lines: fnLines, kind: 'method' });
    }
  }

  // dedupe by file+name+line
  const seen = new Set();
  return results.filter((r) => {
    const k = `${r.file}:${r.name}:${r.startLine}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function detectConcerns(code) {
  const hit = {};
  for (const [key, patterns] of Object.entries(CONCERNS)) {
    if (patterns.some((p) => p.test(code))) hit[key] = true;
  }
  return Object.keys(hit);
}

function analyzeFile(filePath) {
  const rel = path.relative(ROOT, filePath).replace(/\\/g, '/');
  const raw = fs.readFileSync(filePath, 'utf8');
  const code = stripComments(raw);
  const concerns = detectConcerns(raw);
  return {
    rel,
    lineCount: raw.split(/\n/).length,
    concerns,
    classMethods: countClassMethods(code, rel),
    objectMethods: countObjectLiteralMethods(code, rel),
    longFns: findLongFunctions(code, rel),
  };
}

const files = walk(SRC);
const allClass = [];
const allObjects = [];
const allLong = [];
const multiConcern = [];

for (const f of files) {
  const r = analyzeFile(f);
  allClass.push(...r.classMethods);
  allObjects.push(...r.objectMethods);
  allLong.push(...r.longFns);
  if (r.concerns.length > 3) {
    multiConcern.push({
      file: r.rel,
      lines: r.lineCount,
      concerns: r.concerns,
      concernLabels: r.concerns.join(', '),
    });
  }
}

allLong.sort((a, b) => b.lines - a.lines);
multiConcern.sort((a, b) => b.concerns.length - a.concerns.length || b.lines - a.lines);

console.log(JSON.stringify({ allClass, allObjects, allLong, multiConcern, scanned: files.length }, null, 2));
