import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { verifyRule20 } from '../Rule20Verify';
import type { WorkflowDefinition } from '../WorkflowDefinition';
import { normalizeWorkflow } from '../WorkflowGeneration';
import {
  GLOBAL_ARCHITECTURE_DECIDE_STAGE_ID,
  applyRule20StructuralNormalizations,
  buildAutoInsertedGlobalArchitectureWarningLine,
  insertGlobalArchitectureDecisionShellIfNeeded,
} from '../WorkflowRule20Normalize';

function implStage(id: string): WorkflowDefinition['stages'][number] {
  return {
    id,
    title: id,
    tool: 'llm-text',
    toolConfig: { type: 'llm-text', systemPrompt: '实现' },
    input: { sources: [{ type: 'user-input', label: 'u' }], mergeStrategy: 'concat' },
    outputs: [{ key: 'code', format: 'text' }],
    pauseAfter: false,
  };
}

function multiModuleSoftwareWf(): WorkflowDefinition {
  const stages: WorkflowDefinition['stages'] = [];
  for (let i = 1; i <= 6; i++) {
    stages.push(implStage(`stage_impl_module_${i}`));
  }
  return {
    id: 'wf_multi',
    version: '2.0',
    meta: {
      title: '多模块',
      taskType: 'software',
      userInput: '完整 Expo 多模块项目',
      createdAt: '2020-01-01T00:00:00.000Z',
    },
    stages,
  };
}

test('insertGlobalArchitectureDecisionShellIfNeeded inserts before first impl', () => {
  const wf = multiModuleSoftwareWf();
  const inserted = insertGlobalArchitectureDecisionShellIfNeeded(wf);
  assert.equal(inserted, true);
  assert.equal(wf.stages[0].id, GLOBAL_ARCHITECTURE_DECIDE_STAGE_ID);
  assert.equal(wf.meta?.engineAutoInsertedGlobalArchitectureStageId, GLOBAL_ARCHITECTURE_DECIDE_STAGE_ID);
});

test('applyRule20StructuralNormalizations skips insert when option false', () => {
  const wf = multiModuleSoftwareWf();
  applyRule20StructuralNormalizations(wf, { autoInsertGlobalArchitectureDecision: false });
  assert.equal(
    wf.stages.some((s) => s.id === GLOBAL_ARCHITECTURE_DECIDE_STAGE_ID),
    false,
  );
});

test('normalizeWorkflow with autoInsert wires impls and clears missing-global violation', () => {
  const wf = multiModuleSoftwareWf();
  const out = normalizeWorkflow(wf, wf.meta.userInput, 'software', {
    autoInsertGlobalArchitectureDecision: true,
  });
  assert.ok(out.stages.some((s) => s.id === GLOBAL_ARCHITECTURE_DECIDE_STAGE_ID));
  const result = verifyRule20(out);
  assert.equal(
    result.violations.some((v) => v.type === 'broken-naming-pair'),
    false,
  );
  assert.equal(
    result.warnings.some((w) => w.type === 'software-missing-global-architecture-decision'),
    false,
    '插入后不应再报缺全局架构',
  );
});

test('buildAutoInsertedGlobalArchitectureWarningLine emits rule20-soft token', () => {
  const wf = multiModuleSoftwareWf();
  applyRule20StructuralNormalizations(wf, { autoInsertGlobalArchitectureDecision: true });
  const line = buildAutoInsertedGlobalArchitectureWarningLine(wf);
  assert.match(line ?? '', /^rule20-soft:global-architecture-decision-auto-inserted:/);
});

test('normalizeWorkflow without flag keeps software-missing-global warning on verify', () => {
  const wf = multiModuleSoftwareWf();
  const out = normalizeWorkflow(wf, wf.meta.userInput, 'software');
  const result = verifyRule20(out);
  assert.ok(result.warnings.some((w) => w.type === 'software-missing-global-architecture-decision'));
});
