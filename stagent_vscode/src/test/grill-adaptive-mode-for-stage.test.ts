import test from 'node:test';
import assert from 'node:assert/strict';
import type { WorkflowDefinition, Stage } from '../WorkflowDefinition';
import { readGrillAdaptiveModeForStage } from '../GrillAdaptiveFlow';

const baseWf: WorkflowDefinition = {
  id: 'w',
  version: '2.0',
  meta: {
    title: 't',
    taskType: 'software',
    userInput: '实现用户认证模块、订单模块、支付模块并写集成测试',
    createdAt: '2020-01-01T00:00:00Z',
  },
  stages: [],
};

function mockCfg(values: Record<string, unknown>) {
  return {
    get: <T>(key: string, defaultValue?: T): T => {
      const v = values[key];
      return (v !== undefined ? v : defaultValue) as T;
    },
    has: () => false,
    inspect: () => undefined,
    update: async () => undefined,
  } as import('../GrillAdaptiveFlow').GrillStagentConfiguration;
}

test('readGrillAdaptiveModeForStage: explicit true', () => {
  const stage: Stage = {
    id: 'stage_decide_x',
    title: 'd',
    tool: 'llm-text',
    toolConfig: { type: 'llm-text', systemPrompt: 'x' },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [],
    pauseAfter: true,
    isDecisionStage: true,
    questionBefore: [{ id: 'q1', text: '依赖？', required: true }],
  };
  assert.equal(
    readGrillAdaptiveModeForStage({
      cfg: mockCfg({ 'grill.adaptiveMode': true }),
      isDecisionStage: true,
      questionBefore: stage.questionBefore,
      workflow: baseWf,
      stage,
    }),
    true,
  );
});

test('readGrillAdaptiveModeForStage: explicit false overrides heuristic', () => {
  const stage: Stage = {
    id: 'stage_decide_x',
    title: 'd',
    tool: 'llm-text',
    toolConfig: { type: 'llm-text', systemPrompt: 'x' },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [],
    pauseAfter: true,
    isDecisionStage: true,
    questionBefore: [{ id: 'q1', text: '依赖？', required: true }],
  };
  assert.equal(
    readGrillAdaptiveModeForStage({
      cfg: mockCfg({ 'grill.adaptiveMode': false, 'grill.autoOnDecisionStages': true }),
      isDecisionStage: true,
      questionBefore: stage.questionBefore,
      workflow: baseWf,
      stage,
    }),
    false,
  );
});

test('readGrillAdaptiveModeForStage: decision + high complexity heuristic', () => {
  const stage: Stage = {
    id: 'stage_decide_auth',
    title: 'd',
    tool: 'llm-text',
    toolConfig: { type: 'llm-text', systemPrompt: 'x' },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [],
    pauseAfter: true,
    isDecisionStage: true,
    questionBefore: [{ id: 'q1', text: '当前项目用了哪些依赖？', required: true }],
  };
  assert.equal(
    readGrillAdaptiveModeForStage({
      cfg: mockCfg({ 'grill.autoOnDecisionStages': true }),
      isDecisionStage: true,
      questionBefore: stage.questionBefore,
      workflow: baseWf,
      stage,
    }),
    true,
  );
});

test('readGrillAdaptiveModeForStage: non-decision stage returns false', () => {
  const stage: Stage = {
    id: 'stage_impl_x',
    title: 'i',
    tool: 'llm-text',
    toolConfig: { type: 'llm-text', systemPrompt: 'x' },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [],
    pauseAfter: false,
    questionBefore: [{ id: 'q1', text: 'x', required: true }],
  };
  assert.equal(
    readGrillAdaptiveModeForStage({
      cfg: mockCfg({ 'grill.autoOnDecisionStages': true }),
      isDecisionStage: false,
      questionBefore: stage.questionBefore,
      workflow: baseWf,
      stage,
    }),
    false,
  );
});
