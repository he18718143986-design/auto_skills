import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import type { WorkflowDefinition } from '../WorkflowDefinition';
import {
  buildGeneratorCodebaseContextBlock,
  normalizeWorkflow,
  parseWorkflowJson,
} from '../WorkflowGeneration';
import { TRACE_STAGE_WORKFLOW_GEN_REPAIR } from '../generation/GenerationTraceStageIds';

test('normalizeWorkflow auto-adds decision stage for software without isDecisionStage', () => {
  const wf: WorkflowDefinition = {
    id: '',
    version: '2.0',
    meta: {
      title: 't',
      taskType: 'software',
      userInput: 'build api',
      createdAt: '2020-01-01T00:00:00.000Z',
    },
    stages: [
      {
        id: 'stage_impl_a',
        title: 'impl',
        tool: 'llm-text',
        toolConfig: { type: 'llm-text', systemPrompt: 'go' },
        input: { sources: [{ type: 'user-input', label: 'x' }], mergeStrategy: 'concat' },
        outputs: [{ key: 'out', format: 'text' }],
        pauseAfter: false,
      },
    ],
  };
  const out = normalizeWorkflow(wf, 'build api', 'software');
  assert.equal(out.version, '2.0');
  assert.match(out.id, /^wf_/);
  assert.equal(out.stages[0].isDecisionStage, true);
  assert.equal(out.stages[0].pauseAfter, true);
  assert.equal(out.stages[0].outputs.some((o) => o.key === 'decisionRecord'), true);
  assert.match((out.stages[0].toolConfig as { systemPrompt?: string }).systemPrompt ?? '', /DecisionRecord/);
});

test('normalizeWorkflow migrates impl questionAfter to questionBefore when pauseAfter=false', () => {
  const wf: WorkflowDefinition = {
    id: 'wf_q',
    version: '2.0',
    meta: {
      title: 't',
      taskType: 'prototype',
      userInput: 'x',
      createdAt: '2020-01-01T00:00:00.000Z',
    },
    stages: [
      {
        id: 'stage_decide',
        title: 'decide',
        tool: 'llm-text',
        toolConfig: { type: 'llm-text', systemPrompt: 'decide' },
        input: { sources: [{ type: 'user-input', label: 'x' }], mergeStrategy: 'concat' },
        outputs: [{ key: 'decisionRecord', format: 'markdown' }],
        isDecisionStage: true,
        pauseAfter: true,
      },
      {
        id: 'stage_impl_x',
        title: 'impl',
        tool: 'llm-text',
        toolConfig: { type: 'llm-text', systemPrompt: 'go' },
        input: { sources: [{ type: 'user-input', label: 'x' }], mergeStrategy: 'concat' },
        outputs: [{ key: 'out', format: 'text' }],
        pauseAfter: false,
        questionAfter: [{ id: 'q1', text: '确认范围？' }],
      },
    ],
  };
  const out = normalizeWorkflow(wf, 'x', 'prototype');
  const stage = out.stages.find((s) => s.id === 'stage_impl_x')!;
  assert.equal(stage.questionAfter, undefined);
  assert.equal(stage.questionBefore?.length, 1);
  assert.equal(stage.questionBefore?.[0].text, '确认范围？');
});

test('normalizeWorkflow pickZoomOutFilePath injects readable path for stage_zoom_out', () => {
  const wf: WorkflowDefinition = {
    id: 'wf_z',
    version: '2.0',
    meta: {
      title: 't',
      taskType: 'refactor',
      userInput: 'x',
      createdAt: '2020-01-01T00:00:00.000Z',
    },
    stages: [
      {
        id: 'stage_zoom_out',
        title: 'zoom',
        tool: 'file-read',
        toolConfig: { type: 'file-read', filePath: '' },
        input: { sources: [{ type: 'user-input', label: 'x' }], mergeStrategy: 'concat' },
        outputs: [{ key: 'moduleMap', format: 'markdown' }],
        pauseAfter: false,
      },
    ],
  };
  const out = normalizeWorkflow(wf, 'x', 'refactor', {
    pickZoomOutFilePath: () => 'README.md',
  });
  assert.equal((out.stages[0].toolConfig as { filePath?: string }).filePath, 'README.md');
});

test('parseWorkflowJson extracts JSON object from wrapped model output', async () => {
  const raw = `说明文字\n{"id":"wf_ok","version":"2.0","meta":{"title":"ok","taskType":"prototype","userInput":"u","createdAt":"2020-01-01T00:00:00.000Z"},"stages":[]}\n尾部`;
  const wf = await parseWorkflowJson(raw, {
    invokeLlmRaw: async () => {
      throw new Error('repair should not run');
    },
  });
  assert.equal(wf.id, 'wf_ok');
  assert.equal(wf.version, '2.0');
});

test('parseWorkflowJson invokes repair when extraction fails', async () => {
  let repairCalls = 0;
  const wf = await parseWorkflowJson('not json at all', {
    invokeLlmRaw: async (_sys, _user, traceStageId) => {
      repairCalls += 1;
      assert.equal(traceStageId, TRACE_STAGE_WORKFLOW_GEN_REPAIR);
      return '{"id":"wf_fixed","version":"2.0","meta":{"title":"fixed","taskType":"software","userInput":"","createdAt":"2020-01-01T00:00:00.000Z"},"stages":[]}';
    },
  });
  assert.equal(repairCalls, 1);
  assert.equal(wf.id, 'wf_fixed');
});

test('buildGeneratorCodebaseContextBlock includes complexity even without snapshot', () => {
  const { codebaseContext, complexity, depGraph } = buildGeneratorCodebaseContextBlock({
    taskWorkspaceAbs: '/tmp/empty-workspace',
    userInput: '做一个完整项目',
    codebaseSnapshotEnabled: false,
    codebaseContextMaxTokens: 8000,
  });
  assert.match(codebaseContext, /复杂度预估/);
  assert.equal(typeof complexity.estimatedStageCount, 'number');
  assert.ok(depGraph.nodes instanceof Map);
});
