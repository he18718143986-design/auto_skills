import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import type { Stage, WorkflowDefinition } from '../WorkflowDefinition';
import { setSelfHealGapDetector } from '../plan-completeness/selfHealGapDetector';
import { auditSelfHealGaps } from '../workflow-self-heal/injectSelfHealStages';
import { lintPlanCompleteness } from '../PlanCompletenessGate';
import {
  applyPlanCompletenessStructuralRepairs,
  applyPostLintStructuralRepairs,
  inferTestInfraDirectory,
  parseTestRunWorkingDir,
  repairMissingSelfHealChain,
  repairMissingTestInfrastructure,
  repairMissingVerificationStage,
  STAGENT_REPAIR_MARKER,
} from '../WorkflowStructuralRepair';

setSelfHealGapDetector(auditSelfHealGaps);

const META = {
  title: 't',
  taskType: 'software',
  userInput: 'x',
  createdAt: '2026-01-01T00:00:00.000Z',
};

function implStage(
  id: string,
  file: string,
  tool: Stage['tool'] = 'llm-text',
): Stage {
  return {
    id,
    title: id,
    tool,
    toolConfig:
      tool === 'llm-text'
        ? { type: 'llm-text', systemPrompt: 'x', writeOutputToFile: file }
        : { type: 'code-runner', command: file, captureOutput: true },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'out', format: 'text' }],
    pauseAfter: false,
  };
}

function wf(stages: Stage[], taskType = 'software'): WorkflowDefinition {
  return { id: 'wf', version: '2.0', meta: { ...META, taskType }, stages };
}

test('parseTestRunWorkingDir: cd prefix', () => {
  assert.equal(parseTestRunWorkingDir('cd mobile && npm test'), 'mobile');
  assert.equal(parseTestRunWorkingDir('npm test'), undefined);
});

test('inferTestInfraDirectory: from test_run cd', () => {
  const w = wf([
    implStage('stage_impl_a', 'server/a.ts'),
    implStage('stage_test_run', 'cd mobile && npm test', 'code-runner'),
  ]);
  const idx = w.stages.findIndex((s) => s.id === 'stage_test_run');
  assert.deepEqual(inferTestInfraDirectory(w, idx), { dir: 'mobile', pathConfidence: 'high' });
});

test('repairMissingVerificationStage: appends stagent verify stage', () => {
  const w = wf([implStage('stage_impl_a', 'a.ts'), implStage('stage_impl_b', 'b.ts')]);
  const r = repairMissingVerificationStage(w);
  const last = r.workflow.stages[r.workflow.stages.length - 1]!;
  assert.equal(last.id, 'stage_test_run_stagent_verify');
  assert.ok(last.description?.includes(STAGENT_REPAIR_MARKER));
  assert.equal(lintPlanCompleteness(r.workflow).some((i) => i.type === 'missing-verification-stage'), false);
});

test('repairMissingTestInfrastructure: inserts jest before first test_run', () => {
  const w = wf([
    implStage('stage_impl_auth', 'src/auth.ts'),
    implStage('stage_impl_api', 'src/api.ts'),
    implStage('stage_test_run_auth', 'npm test', 'code-runner'),
  ]);
  const r = repairMissingTestInfrastructure(w);
  assert.ok(r.action);
  assert.equal(r.workflow.stages[2]!.id, 'stage_impl_stagent_jest_config');
  assert.ok(r.workflow.stages[2]!.description?.includes(STAGENT_REPAIR_MARKER));
  assert.equal(
    lintPlanCompleteness(r.workflow).some((i) => i.type === 'missing-test-infrastructure'),
    false,
  );
});

test('repairMissingTestInfrastructure: cd server inserts jest under server/', () => {
  const w = wf([
    implStage('stage_impl_a', 'server/a.ts'),
    implStage('stage_test_run', 'cd server && npm test', 'code-runner'),
  ]);
  const r = repairMissingTestInfrastructure(w);
  const jestStage = r.workflow.stages.find((s) => s.id.includes('jest_config'));
  assert.ok(jestStage);
  const tc = jestStage!.toolConfig as { writeOutputToFile?: string };
  assert.equal(tc.writeOutputToFile, 'server/jest.config.js');
  assert.equal(
    lintPlanCompleteness(r.workflow).some((i) => i.type === 'test-infra-path-mismatch'),
    false,
  );
});

test('repairMissingTestInfrastructure: expo inserts jest + babel', () => {
  const w = wf([
    implStage('stage_impl_mobile_app', 'mobile/App.tsx'),
    implStage('stage_test_run', 'npx jest', 'code-runner'),
  ]);
  const r = repairMissingTestInfrastructure(w);
  assert.equal(r.action?.stageIds.length, 2);
  assert.ok(r.workflow.stages.some((s) => s.id === 'stage_impl_stagent_jest_config'));
  assert.ok(r.workflow.stages.some((s) => s.id === 'stage_impl_stagent_babel_config'));
});

test('applyPostLintStructuralRepairs: off mode no-op', () => {
  const w = wf([
    implStage('stage_impl_a', 'a.ts'),
    implStage('stage_impl_b', 'b.ts'),
  ]);
  const issues = lintPlanCompleteness(w);
  const r = applyPostLintStructuralRepairs(w, issues, {
    mode: 'off',
    userInput: 'x',
    taskType: 'software',
  });
  assert.equal(r.changed, false);
  assert.equal(r.actions.length, 0);
});

test('repairMissingSelfHealChain: inserts verify_imports and fix between write and run', () => {
  const w = wf([
    implStage('stage_impl_chat_websocket_server', 'server/src/ws.ts'),
    implStage('stage_test_write_chat_integration', 'server/__tests__/chat_integration.test.ts'),
    implStage('stage_test_run_chat_integration', 'cd server && npm test -- chat_integration', 'code-runner'),
  ]);
  assert.ok(lintPlanCompleteness(w).some((i) => i.type === 'missing-self-heal-chain'));
  const r = repairMissingSelfHealChain(w);
  assert.ok(r.action);
  const ids = r.workflow.stages.map((s: Stage) => s.id);
  const writeIdx = ids.indexOf('stage_test_write_chat_integration');
  const importsIdx = ids.indexOf('stage_verify_imports_chat_integration');
  const runIdx = ids.indexOf('stage_test_run_chat_integration');
  const fixIdx = ids.indexOf('stage_fix_if_failed_chat_integration');
  assert.ok(importsIdx > writeIdx && runIdx > importsIdx);
  assert.ok(fixIdx > runIdx);
  assert.ok(ids.includes('stage_npm_install_server'));
  assert.equal(lintPlanCompleteness(r.workflow).some((i) => i.type === 'missing-self-heal-chain'), false);
});

test('applyPlanCompletenessStructuralRepairs: does not fix missing-main-assembly', () => {
  const w = wf([
    implStage('stage_impl_a', 'server/a.ts'),
    implStage('stage_impl_b', 'server/b.ts'),
    implStage('stage_impl_c', 'server/c.ts'),
    implStage('stage_test_run', 'npm test', 'code-runner'),
  ]);
  const issues = lintPlanCompleteness(w);
  assert.ok(issues.some((i) => i.type === 'missing-main-assembly'));
  const r = applyPlanCompletenessStructuralRepairs(w, issues);
  assert.equal(r.actions.some((a) => a.code === 'missing-main-assembly'), false);
  assert.ok(r.remainingPlanIssues.some((i) => i.type === 'missing-main-assembly'));
});
