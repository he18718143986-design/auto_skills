import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { verifyRule20 } from '../Rule20Verify';
import type { WorkflowDefinition } from '../WorkflowDefinition';
import { normalizeWorkflow } from '../WorkflowGeneration';
import {
  applyRule20StructuralNormalizations,
  findGlobalArchitectureDecisionStage,
  fixTestRunStagesMustUseCodeRunner,
  wireSoftwareImplDecisionSources,
} from '../WorkflowRule20Normalize';

function softwareWf(stages: WorkflowDefinition['stages']): WorkflowDefinition {
  return {
    id: 'wf_scaffold',
    version: '2.0',
    meta: {
      title: 'scaffold',
      taskType: 'software',
      userInput: '完整 Expo 项目',
      createdAt: '2020-01-01T00:00:00.000Z',
    },
    stages,
  };
}

test('wireOrphanImplStages links scaffold impl to global architecture decisionRecord', () => {
  const wf = softwareWf([
    {
      id: 'stage_decide_architecture_overview',
      title: '全局架构',
      tool: 'llm-text',
      toolConfig: { type: 'llm-text', systemPrompt: 'decide' },
      input: { sources: [{ type: 'user-input', label: 'u' }], mergeStrategy: 'concat' },
      outputs: [{ key: 'decisionRecord', format: 'markdown' }],
      pauseAfter: true,
      isDecisionStage: true,
    },
    {
      id: 'stage_impl_project_tsconfig',
      title: 'tsconfig',
      tool: 'llm-text',
      toolConfig: { type: 'llm-text', systemPrompt: '写 tsconfig' },
      input: { sources: [{ type: 'user-input', label: 'u' }], mergeStrategy: 'concat' },
      outputs: [{ key: 'code', format: 'text' }],
      pauseAfter: false,
    },
  ]);

  applyRule20StructuralNormalizations(wf);
  const impl = wf.stages[1];
  assert.equal(
    impl.input.sources.some(
      (s) =>
        s.type === 'stage-output' &&
        s.stageId === 'stage_decide_architecture_overview' &&
        s.outputKey === 'decisionRecord',
    ),
    true,
  );
  assert.match((impl.toolConfig as { systemPrompt?: string }).systemPrompt ?? '', /严格按照已确认的决策清单实现/);
});

test('normalizeWorkflow applies scaffold wiring for software workflows', () => {
  const wf = softwareWf([
    {
      id: 'stage_decide_architecture_overview',
      title: '全局架构',
      tool: 'llm-text',
      toolConfig: { type: 'llm-text', systemPrompt: 'decide' },
      input: { sources: [{ type: 'user-input', label: 'u' }], mergeStrategy: 'concat' },
      outputs: [{ key: 'decisionRecord', format: 'markdown' }],
      pauseAfter: true,
      isDecisionStage: true,
    },
    {
      id: 'stage_impl_project_babel_config',
      title: 'babel',
      tool: 'llm-text',
      toolConfig: { type: 'llm-text', systemPrompt: '写 babel' },
      input: { sources: [{ type: 'user-input', label: 'u' }], mergeStrategy: 'concat' },
      outputs: [{ key: 'code', format: 'text' }],
      pauseAfter: false,
    },
  ]);

  const out = normalizeWorkflow(wf, '完整 Expo 项目', 'software');
  const result = verifyRule20(out);
  assert.equal(
    result.violations.some((v) => v.type === 'missing-decision-stage' && v.stageId === 'stage_impl_project_babel_config'),
    false,
  );
  assert.equal(
    result.violations.some(
      (v) => v.type === 'missing-decisionRecord-source' && v.stageId === 'stage_impl_project_babel_config',
    ),
    false,
  );
  assert.ok(result.warnings.some((w) => w.type === 'impl-decision-not-paired'));
});

test('wireOrphanImplStages does not override slice-specific decisionRecord source', () => {
  const wf = softwareWf([
    {
      id: 'stage_decide_architecture_overview',
      title: '全局',
      tool: 'llm-text',
      toolConfig: { type: 'llm-text', systemPrompt: 'decide' },
      input: { sources: [{ type: 'user-input', label: 'u' }], mergeStrategy: 'concat' },
      outputs: [{ key: 'decisionRecord', format: 'markdown' }],
      pauseAfter: true,
      isDecisionStage: true,
    },
    {
      id: 'stage_decide_slice2_auth',
      title: '切片决策',
      tool: 'llm-text',
      toolConfig: { type: 'llm-text', systemPrompt: 'decide slice' },
      input: { sources: [{ type: 'user-input', label: 'u' }], mergeStrategy: 'concat' },
      outputs: [{ key: 'decisionRecord', format: 'markdown' }],
      pauseAfter: true,
      isDecisionStage: true,
    },
    {
      id: 'stage_impl_slice2_auth_context',
      title: 'AuthContext',
      tool: 'llm-text',
      toolConfig: {
        type: 'llm-text',
        systemPrompt: '严格按照已确认的决策清单实现，不得偏离。',
      },
      input: {
        sources: [
          {
            type: 'stage-output',
            stageId: 'stage_decide_slice2_auth',
            outputKey: 'decisionRecord',
            label: '切片决策',
          },
        ],
        mergeStrategy: 'concat',
      },
      outputs: [{ key: 'code', format: 'text' }],
      pauseAfter: false,
    },
  ]);

  applyRule20StructuralNormalizations(wf);
  const impl = wf.stages[2];
  const decisionSources = impl.input.sources.filter((s) => s.outputKey === 'decisionRecord');
  assert.equal(decisionSources.length, 2);
  assert.equal(decisionSources[0].stageId, 'stage_decide_architecture_overview');
  assert.equal(decisionSources[1].stageId, 'stage_decide_slice2_auth');
});

test('wireOrphanImplStages + verifyRule20: slice-only impl does not break global architecture pairing', () => {
  const wf = softwareWf([
    {
      id: 'stage_decide_architecture_overview',
      title: '全局架构决策',
      tool: 'llm-text',
      toolConfig: { type: 'llm-text', systemPrompt: 'decide' },
      input: { sources: [{ type: 'user-input', label: 'u' }], mergeStrategy: 'concat' },
      outputs: [{ key: 'decisionRecord', format: 'markdown' }],
      pauseAfter: true,
      isDecisionStage: true,
    },
    {
      id: 'stage_decide_auth',
      title: '认证模块决策',
      tool: 'llm-text',
      toolConfig: { type: 'llm-text', systemPrompt: 'decide' },
      input: { sources: [{ type: 'user-input', label: 'u' }], mergeStrategy: 'concat' },
      outputs: [{ key: 'decisionRecord', format: 'markdown' }],
      pauseAfter: true,
      isDecisionStage: true,
    },
    {
      id: 'stage_impl_auth_service',
      title: '实现认证服务',
      tool: 'llm-text',
      toolConfig: { type: 'llm-text', systemPrompt: '实现 authService' },
      input: {
        sources: [
          {
            type: 'stage-output',
            stageId: 'stage_decide_auth',
            outputKey: 'decisionRecord',
            label: '模块决策',
          },
        ],
        mergeStrategy: 'concat',
      },
      outputs: [{ key: 'code', format: 'text' }],
      pauseAfter: false,
    },
  ]);

  applyRule20StructuralNormalizations(wf);
  const result = verifyRule20(wf);
  assert.equal(
    result.violations.some((v) => v.type === 'broken-naming-pair'),
    false,
    '全局架构决策被切片 impl 消费后不应 broken-naming-pair',
  );
  assert.ok(result.warnings.some((w) => w.type === 'decision-not-paired'));
});

test('wireSoftwareImplDecisionSources links paired stage_decide_<X> when semantic names match', () => {
  const wf = softwareWf([
    {
      id: 'stage_decide_architecture_overview',
      title: '全局',
      tool: 'llm-text',
      toolConfig: { type: 'llm-text', systemPrompt: 'decide' },
      input: { sources: [{ type: 'user-input', label: 'u' }], mergeStrategy: 'concat' },
      outputs: [{ key: 'decisionRecord', format: 'markdown' }],
      pauseAfter: true,
      isDecisionStage: true,
    },
    {
      id: 'stage_decide_auth_service',
      title: '认证决策',
      tool: 'llm-text',
      toolConfig: { type: 'llm-text', systemPrompt: 'decide' },
      input: { sources: [{ type: 'user-input', label: 'u' }], mergeStrategy: 'concat' },
      outputs: [{ key: 'decisionRecord', format: 'markdown' }],
      pauseAfter: true,
      isDecisionStage: true,
    },
    {
      id: 'stage_impl_auth_service',
      title: '实现 auth',
      tool: 'llm-text',
      toolConfig: { type: 'llm-text', systemPrompt: '写服务' },
      input: { sources: [{ type: 'user-input', label: 'u' }], mergeStrategy: 'concat' },
      outputs: [{ key: 'code', format: 'text' }],
      pauseAfter: false,
    },
  ]);

  applyRule20StructuralNormalizations(wf);
  const impl = wf.stages[2];
  const ids = impl.input.sources
    .filter((s) => s.outputKey === 'decisionRecord')
    .map((s) => s.stageId);
  assert.deepEqual(ids, ['stage_decide_architecture_overview', 'stage_decide_auth_service']);
  const result = verifyRule20(wf);
  assert.equal(result.violations.some((v) => v.type === 'missing-decision-stage'), false);
  assert.equal(result.violations.some((v) => v.type === 'missing-constraint-prompt'), false);
});

test('fixTestRunStagesMustUseCodeRunner coerces llm-text to code-runner', () => {
  const wf: WorkflowDefinition = {
    id: 'wf_test_run',
    version: '2.0',
    meta: {
      title: 't',
      taskType: 'prototype',
      userInput: 'u',
      createdAt: '2020-01-01T00:00:00.000Z',
    },
    stages: [
      {
        id: 'stage_test_run_auth',
        title: '跑测试',
        tool: 'llm-text',
        toolConfig: { type: 'llm-text', systemPrompt: '请执行 npm test 并汇报' },
        input: { sources: [{ type: 'user-input', label: 'u' }], mergeStrategy: 'concat' },
        outputs: [{ key: 'stdout', format: 'text' }],
        pauseAfter: false,
      },
    ],
  };

  fixTestRunStagesMustUseCodeRunner(wf);
  const run = wf.stages[0];
  assert.equal(run.tool, 'code-runner');
  assert.equal((run.toolConfig as { type: string; command: string }).command, 'npm test');
  assert.equal(verifyRule20(wf).violations.some((v) => v.type === 'test-run-must-use-code-runner'), false);
});

test('normalizeWorkflow fixes test_run and constraint prompt on prototype', () => {
  const wf: WorkflowDefinition = {
    id: 'wf_proto',
    version: '2.0',
    meta: {
      title: 'p',
      taskType: 'prototype',
      userInput: 'u',
      createdAt: '2020-01-01T00:00:00.000Z',
    },
    stages: [
      {
        id: 'stage_test_run_integration',
        title: '集成',
        tool: 'llm-text',
        toolConfig: { type: 'llm-text', systemPrompt: 'run tests' },
        input: { sources: [{ type: 'user-input', label: 'u' }], mergeStrategy: 'concat' },
        outputs: [{ key: 'stdout', format: 'text' }],
        pauseAfter: false,
      },
    ],
  };

  const out = normalizeWorkflow(wf, 'u', 'prototype');
  assert.equal(out.stages[0].tool, 'code-runner');
  assert.equal(verifyRule20(out).violations.some((v) => v.type === 'test-run-must-use-code-runner'), false);
});

test('findGlobalArchitectureDecisionStage prefers architecture_overview id', () => {
  const stages = [
    { id: 'stage_decide_slice1', isDecisionStage: true } as WorkflowDefinition['stages'][number],
    { id: 'stage_decide_architecture_overview', isDecisionStage: true } as WorkflowDefinition['stages'][number],
  ];
  assert.equal(findGlobalArchitectureDecisionStage(stages)?.id, 'stage_decide_architecture_overview');
});

test('code-runner stage_impl_* does not trigger missing-constraint-prompt after normalize', () => {
  const wf = softwareWf([
    {
      id: 'stage_decide_architecture_overview',
      title: '全局架构',
      tool: 'llm-text',
      toolConfig: { type: 'llm-text', systemPrompt: 'decide' },
      input: { sources: [{ type: 'user-input', label: 'u' }], mergeStrategy: 'concat' },
      outputs: [{ key: 'decisionRecord', format: 'markdown' }],
      pauseAfter: true,
      isDecisionStage: true,
    },
    {
      id: 'stage_impl_project_init',
      title: '脚手架',
      tool: 'code-runner',
      toolConfig: { type: 'code-runner', command: 'npm init -y', captureOutput: true },
      input: { sources: [{ type: 'user-input', label: 'u' }], mergeStrategy: 'concat' },
      outputs: [{ key: 'stdout', format: 'text' }],
      pauseAfter: false,
    },
    {
      id: 'stage_impl_slice_1_deploy_files',
      title: '切片1 部署',
      tool: 'code-runner',
      toolConfig: { type: 'code-runner', command: 'node deploy.js', captureOutput: true },
      input: { sources: [{ type: 'user-input', label: 'u' }], mergeStrategy: 'concat' },
      outputs: [{ key: 'stdout', format: 'text' }],
      pauseAfter: false,
    },
  ]);

  const out = normalizeWorkflow(wf, '完整项目', 'software');
  const result = verifyRule20(out);
  assert.equal(
    result.violations.some((v) => v.type === 'missing-constraint-prompt'),
    false,
    `unexpected: ${result.violations.map((v) => v.type + ':' + v.stageId).join(', ')}`,
  );
});
