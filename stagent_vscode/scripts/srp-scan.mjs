#!/usr/bin/env node
/**
 * SRP heuristic scan: method counts, long functions, multi-concern files.
 */
import fs from 'node:fs';
import path from 'node:path';

// SCAN_ALLOWLIST — 仅跳过 multiConcern 计数（manyMethods / longFuncs 不设豁免）
const MULTI_CONCERN_ALLOWLIST = [
  /^src\/workflow-types\//,
  /^src\/execution-bindings\/executor-loop-types\.ts$/,
  /^src\/execution-bindings\/types\.ts$/,
  /^src\/WorkflowEngineFacades\.ts$/,
  /^src\/WorkflowEngine\.ts$/,
  /^src\/WorkflowEngineInternals\.ts$/,
  /^src\/StageExecutionHost\.ts$/,
];

function isMultiConcernAllowlisted(rel) {
  return MULTI_CONCERN_ALLOWLIST.some((re) => re.test(rel));
}

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'src');
const SKIP = new Set(['node_modules', 'out', 'generated', 'test']);

const CONCERNS = {
  ui: /\b(webview|postMessage|WebviewPanel|vscode\.window|escapeHtml|FrontendMessage|BackendMessage|TaskListProvider|AiControls|WebviewScript|WebviewTemplate|Rule20WarningDisplay|ArtifactUiHints|WorkflowArtifactUi|InstanceSession|DecisionReviewUi|WorkflowRecoveryViewModel|WorkflowUiBridge|confirmSection|pause-bar|timeline)\b/i,
  llm: /\b(LlmClient|llm-text|openai|completions|systemPrompt|WorkflowPrompts|PromptFragments|generateWorkflow|buildWorkflowGenerator|streaming|maxTokens|temperature)\b/i,
  fs: /\b(readTextFile|writeTextFile|writeFileSync|readFileSync|persistInstance|FsAsync|\.wf-state|atomicWrite|mkdirSync|rmSync|glob|readdir)\b/i,
  exec: /\b(executeNextStage|WorkflowExecutor|code-runner|runCodeRunner|WorkflowStageStep|spawn|execSync|child_process|SandboxExecutor)\b/i,
  persist: /\b(WorkflowPersistence|WorkflowInstanceRepository|globalState|InstanceManager|scheduleSave|ArtifactLifecycle|ExperienceStore|PromptVersionManager|AdrPersistence)\b/i,
  gates: /\b(QualityGate|Rule20|verifyRule20|lintCross|PlanCompleteness|ConfidenceScorer|BuiltinQualityGates)\b/i,
  hitl: /\b(approveDecision|pauseAfter|questionBefore|questionAfter|HitlCoordinator|retryStage|AdaptiveHITL)\b/i,
  dag: /\b(WorkflowDag|dependsOn|pickDagExecutionBatch|dagMaxParallelism|enableDagScheduler)\b/i,
  settings: /\b(StagentSettings|EffectiveSettings|WorkspaceConfiguration|readPromptVersions|settingsProfile)\b/i,
};

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP.has(e.name)) walk(full, out);
    } else if (/\.(ts|tsx|js|mjs)$/.test(e.name) && !e.name.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

function countClassMethods(content) {
  const results = [];
  // class Name { ... method( ... ) or get/set
  const classRe = /export\s+(?:default\s+)?class\s+(\w+)[^{]*\{([\s\S]*?)\n\}/g;
  let m;
  while ((m = classRe.exec(content))) {
    const body = m[2];
    const methods = new Set();
    const methodRe = /^\s*(?:public\s+|private\s+|protected\s+|async\s+|static\s+)*(\w+)\s*(?:<[^>]*>)?\s*\([^)]*\)\s*(?::\s*[^{]+)?\{/gm;
    let mm;
    while ((mm = methodRe.exec(body))) {
      const name = mm[1];
      if (!['if', 'for', 'while', 'switch', 'catch', 'constructor'].includes(name)) {
        methods.add(name);
      }
    }
    // constructor
    if (/constructor\s*\(/.test(body)) methods.add('constructor');
    if (methods.size > 0) results.push({ name: m[1], count: methods.size, methods: [...methods] });
  }
  return results;
}

function countObjectLiteralMethods(content) {
  const results = [];
  // export const foo = { bar() {}, baz: function() {} }
  const objRe = /export\s+(?:const|function)\s+(\w+)\s*=\s*\{([\s\S]*?)\n\};/g;
  let m;
  while ((m = objRe.exec(content))) {
    const body = m[2];
    const methods = new Set();
    const re = /^\s*(?:async\s+)?(\w+)\s*(?:<[^>]*>)?\s*\([^)]*\)\s*(?::\s*[^{]+)?\{/gm;
    let mm;
    while ((mm = re.exec(body))) {
      methods.add(mm[1]);
    }
    if (methods.size > 20) results.push({ name: m[1], count: methods.size, type: 'object' });
  }
  return results;
}

function findLongFunctions(content, filePath) {
  const lines = content.split(/\r?\n/);
  const funcStarts = [];
  const funcRe = /^export\s+(?:async\s+)?function\s+(\w+)/;
  const methodRe = /^(?:export\s+)?(?:async\s+)?(?:function\s+)?(\w+)\s*(?:<[^>]*>)?\([^)]*\)\s*(?::\s*[^{]+)?\{$/;
  const arrowExport = /^export\s+(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*(?::\s*[^=]+)?\s*=>\s*\{?$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let name = null;
    if (funcRe.test(line)) name = line.match(funcRe)[1];
    else if (/^export\s+async\s+function\s+(\w+)/.test(line)) name = line.match(/^export\s+async\s+function\s+(\w+)/)[1];
    else if (/^function\s+(\w+)/.test(line) && !line.includes('=>')) name = line.match(/^function\s+(\w+)/)[1];
    else if (arrowExport.test(line)) name = line.match(arrowExport)[1];
    if (name) funcStarts.push({ name, line: i + 1, depth: braceDepthAt(lines, i) });
  }

  const long = [];
  for (let idx = 0; idx < funcStarts.length; idx++) {
    const start = funcStarts[idx];
    const endLine = findFunctionEnd(lines, start.line - 1);
    const len = endLine - start.line + 1;
    if (len > 80) {
      long.push({ file: path.relative(ROOT, filePath), name: start.name, startLine: start.line, lines: len });
    }
  }
  return long;
}

function braceDepthAt(lines, idx) {
  let d = 0;
  for (let i = 0; i < idx; i++) {
    for (const c of lines[i]) {
      if (c === '{') d++;
      if (c === '}') d--;
    }
  }
  return d;
}

function findFunctionEnd(lines, startIdx) {
  let depth = 0;
  let started = false;
  for (let i = startIdx; i < lines.length; i++) {
    for (const c of lines[i]) {
      if (c === '{') { depth++; started = true; }
      if (c === '}') depth--;
    }
    if (started && depth === 0) return i + 1;
  }
  return lines.length;
}

function detectConcerns(content) {
  const hit = [];
  for (const [k, re] of Object.entries(CONCERNS)) {
    if (re.test(content)) hit.push(k);
  }
  return hit;
}

const files = walk(SRC);
const manyMethods = [];
const longFuncs = [];
const multiConcern = [];

for (const f of files) {
  const content = fs.readFileSync(f, 'utf8');
  const rel = path.relative(ROOT, f).replace(/\\/g, '/');

  for (const c of countClassMethods(content)) {
    if (c.count > 20) manyMethods.push({ file: rel, ...c });
  }
  for (const o of countObjectLiteralMethods(content)) {
    manyMethods.push({ file: rel, ...o });
  }

  longFuncs.push(...findLongFunctions(content, f));

  const concerns = detectConcerns(content);
  if (concerns.length > 3 && !isMultiConcernAllowlisted(rel)) {
    multiConcern.push({ file: rel, concerns, count: concerns.length, lines: content.split(/\n/).length });
  }
}

manyMethods.sort((a, b) => b.count - a.count);
longFuncs.sort((a, b) => b.lines - a.lines);
multiConcern.sort((a, b) => b.count - a.count || b.lines - a.lines);

console.log(JSON.stringify({ manyMethods, longFuncs, multiConcern }, null, 2));
