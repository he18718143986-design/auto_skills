#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'src');

function walk(dir, out = [], skipTest = false) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'test' && skipTest) continue;
      walk(full, out, skipTest);
    } else if (/\.ts$/.test(e.name) && !e.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

const prodFiles = walk(SRC, [], true).filter((f) => !f.includes(`${path.sep}test${path.sep}`));
const testFiles = walk(path.join(SRC, 'test'), []).filter((f) => f.endsWith('.test.ts'));

function baseName(f) {
  return path.basename(f, '.ts').replace(/\.test$/, '');
}

function moduleKey(rel) {
  const base = path.basename(rel, '.ts');
  return base;
}

// Map test -> imports from src
const testImports = new Map();
const mockStats = [];

for (const tf of testFiles) {
  const rel = path.relative(ROOT, tf).replace(/\\/g, '/');
  const code = fs.readFileSync(tf, 'utf8');
  const imported = new Set();
  for (const m of code.matchAll(/from\s+['"](\.\.\/[^'"]+)['"]/g)) {
    imported.add(m[1].replace(/^\.\.\//, 'src/'));
  }
  testImports.set(rel, [...imported]);

  const lines = code.split(/\n/).length;
  const mockLines =
    (code.match(/\b(mock|stub|fake|sinon|jest\.mock)\b/gi) || []).length +
    (code.match(/\binstallVscodeStub\b/g) || []).length +
    (code.match(/\bcreateMock\b/gi) || []).length +
    (code.match(/\bMockEngine\b/g) || []).length +
    (code.match(/\bworkflow-engine-test-harness\b/g) || []).length +
    (code.match(/\bwebview-script-test-harness\b/g) || []).length +
    (code.match(/\bMiniDocument\b/g) || []).length +
    (code.match(/verifyRule20Mock|mockVerify|stubVerify/g) || []).length;
  const assertLines = (code.match(/\bassert\./g) || []).length;
  mockStats.push({ rel, lines, mockHits: mockLines, asserts: assertLines, ratio: mockLines / Math.max(lines, 1) });
}

// prod file covered if any test imports it or test name matches
const covered = new Set();
for (const [testRel, imports] of testImports) {
  const testBase = path.basename(testRel, '.test.ts');
  for (const imp of imports) {
    covered.add(imp);
    if (imp.endsWith('.ts')) covered.add(imp);
    else covered.add(imp + '.ts');
  }
  // heuristic: workflow-engine.test -> WorkflowEngine
  const kebab = testBase.replace(/-/g, '');
}

for (const pf of prodFiles) {
  const rel = path.relative(ROOT, pf).replace(/\\/g, '/');
  const base = path.basename(pf, '.ts');
  const dir = path.dirname(rel);

  for (const tf of testFiles) {
    const tRel = path.relative(ROOT, tf).replace(/\\/g, '/');
    const tBase = path.basename(tf, '.test.ts');
    const code = fs.readFileSync(tf, 'utf8');
    if (code.includes(`'../${base}'`) || code.includes(`"../${base}"`)) {
      covered.add(rel);
    }
    if (code.includes(`'../${path.relative('src', rel).replace(/\\/g, '/').replace(/\.ts$/, '')}'`)) {
      covered.add(rel);
    }
    // kebab-case test name
    const kebab = base.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
    if (tBase === kebab || tBase.includes(kebab) || kebab.includes(tBase)) {
      if (tBase.length > 5 && kebab.length > 5) covered.add(rel);
    }
  }
}

// Core modules list
const CORE_PATTERNS = [
  'WorkflowEngine.ts',
  'WorkflowExecutorLoop.ts',
  'WorkflowStageStep.ts',
  'extension.ts',
  'WorkflowInstanceManager.ts',
  'WorkflowGenerationRunner.ts',
  'WorkflowHitlCoordinator.ts',
  'WorkflowPanelMessageRouter.ts',
  'WorkflowUiBridge.ts',
  'WorkflowPersistence.ts',
  'WorkflowInstanceRepository.ts',
  'BuiltinQualityGates.ts',
  'Rule20Verify.ts',
  'RedGreenGate.ts',
  'PlanCompletenessGate.ts',
  'QualityGateRunner.ts',
  'DebugFeedbackLoopGate.ts',
  'GeneratedWorkflowGate.ts',
  'WorkflowStartCoordinator.ts',
  'WorkflowPreGenerationCoordinator.ts',
  'StagentTaskListProvider.ts',
  'StagentAiControlsProvider.ts',
  'WebviewPanel.ts',
  'WorkflowArtifactUi.ts',
  'SandboxExecutor.ts',
  'WorkflowNonLlmToolRunner.ts',
  'WorkflowEngineHostFactories.ts',
  'WorkflowEngineExecutionBinder.ts',
  'WorkflowEnginePersistenceBridge.ts',
  'WorkflowEngineMessaging.ts',
  'PromptVersionManager.ts',
  'GrillAdaptiveFlow.ts',
  'GrillCodeExplore.ts',
  'FailurePatternAnalyzer.ts',
  'WorkflowRecoveryViewModel.ts',
  'rule20/verify.ts',
];

const uncoveredCore = CORE_PATTERNS.filter((p) => {
  const rel = p.startsWith('src/') ? p : `src/${p}`;
  return !covered.has(rel) && !testFiles.some((tf) => {
    const c = fs.readFileSync(tf, 'utf8');
    const mod = path.basename(p, '.ts');
    return c.includes(`'../${mod}'`) || c.includes(`"../${mod}"`) || c.includes(`rule20/verify`);
  });
});

// All prod without test
const allUncovered = [];
for (const pf of prodFiles) {
  const rel = path.relative(ROOT, pf).replace(/\\/g, '/');
  if (rel.includes('generated/') || rel.includes('webview/runtime/') || rel.includes('webview/sidebar/') ||
      rel.includes('webview/components/') || rel.endsWith('-entry.ts') || rel.endsWith('-entry.tsx') ||
      rel.includes('engine-host/') && !rel.includes('index')) {
    // still track but separate
  }
  const base = path.basename(pf, '.ts');
  let hasTest = false;
  for (const tf of testFiles) {
    const c = fs.readFileSync(tf, 'utf8');
    if (c.includes(`'../${base}'`) || c.includes(`"../${base}"`)) {
      hasTest = true;
      break;
    }
    const sub = rel.replace(/^src\//, '../');
    if (c.includes(`'${sub.replace(/\.ts$/, '')}'`)) hasTest = true;
  }
  if (!hasTest) allUncovered.push(rel);
}

mockStats.sort((a, b) => b.mockHits - a.mockHits);

const gateModules = [
  'Rule20Verify.ts',
  'rule20/verify.ts',
  'RedGreenGate.ts',
  'RedGreenFsm.ts',
  'PlanCompletenessGate.ts',
  'QualityGate.ts',
  'QualityGateRunner.ts',
  'BuiltinQualityGates.ts',
  'Rule20RuntimeGate.ts',
  'DebugFeedbackLoopGate.ts',
  'GeneratedWorkflowGate.ts',
  'ApproveDecisionGate.ts',
  'PrototypeContractLint.ts',
  'ConfigContractLint.ts',
  'CrossFileKeyContractLint.ts',
  'SdkPathContractLint.ts',
  'TestRunPreflight.ts',
];

const gateCoverage = gateModules.map((g) => {
  const mod = path.basename(g, '.ts');
  const tests = testFiles.filter((tf) => {
    const c = fs.readFileSync(tf, 'utf8');
    return c.includes(`'../${mod}'`) || c.includes(`"../${mod}"`) || 
      (g.includes('rule20') && c.includes('rule20/verify')) ||
      (mod === 'verifyRule20' && c.includes('verifyRule20'));
  });
  return { module: `src/${g}`, tests: tests.map((t) => path.relative(ROOT, t).replace(/\\/g, '/')) };
});

console.log(JSON.stringify({
  prodCount: prodFiles.length,
  testCount: testFiles.length,
  uncoveredCore,
  allUncoveredCount: allUncovered.length,
  allUncovered: allUncovered.filter((r) => 
    !r.includes('webview/') && !r.includes('generated/') && !r.endsWith('.tsx')
  ).slice(0, 80),
  topMockHeavy: mockStats.filter((m) => m.mockHits >= 8 || m.ratio > 0.08).slice(0, 25),
  gateCoverage,
}, null, 2));
