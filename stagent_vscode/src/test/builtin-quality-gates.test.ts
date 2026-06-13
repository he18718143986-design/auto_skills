import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { registerBuiltinQualityGates } from '../BuiltinQualityGates';
import {
  GATE_ID_PLAN_COMPLETENESS,
  GATE_ID_RULE20_VIOLATIONS,
  GATE_ID_SCHEMA_VALIDATION,
} from '../QualityGateIds';
import {
  getDefaultQualityGateRegistry,
  resetDefaultQualityGateRegistry,
  type QualityGateContext,
} from '../QualityGate';
import { runQualityGates } from '../QualityGateRunner';
import type { Stage, WorkflowDefinition } from '../WorkflowDefinition';
import { verifyRule20 } from '../Rule20Verify';

function resetAndRegister(): void {
  resetDefaultQualityGateRegistry();
  registerBuiltinQualityGates();
}

const defaultGates = {
  toIssuesHorizontalLayeringFail: false,
  debugFeedbackLoopMode: 'hard' as const,
  planCompletenessEnabled: true,
  planStructuralRepairMode: 'off' as const,
  staticAnalysisEnabled: false,
  contractPlanPreflightV2: false,
};

function baseMeta() {
  return {
    title: 't',
    taskType: 'software' as const,
    userInput: 'x',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function rule20ViolationWorkflow(): WorkflowDefinition {
  const wf: WorkflowDefinition = {
    id: 'wf_rule20',
    version: '2.0',
    meta: baseMeta(),
    stages: [
      {
        id: 'stage_decide_parser',
        title: 'decide',
        tool: 'llm-text',
        toolConfig: { type: 'llm-text', systemPrompt: 'decision' },
        input: { sources: [{ type: 'user-input', label: '需求' }], mergeStrategy: 'concat' },
        outputs: [{ key: 'decisionRecord', format: 'markdown' }],
        pauseAfter: true,
        isDecisionStage: true,
      },
      {
        id: 'stage_impl_parser',
        title: 'impl',
        tool: 'llm-text',
        toolConfig: { type: 'llm-text', systemPrompt: 'implement freely' },
        input: {
          sources: [
            {
              type: 'stage-output',
              stageId: 'stage_decide_parser',
              outputKey: 'decisionRecord',
              label: '已确认的决策清单',
            },
          ],
          mergeStrategy: 'concat',
        },
        outputs: [{ key: 'code', format: 'text' }],
        pauseAfter: false,
      },
    ],
  };
  return wf;
}

function implStage(id: string, file: string): Stage {
  return {
    id,
    title: id,
    tool: 'llm-text',
    toolConfig: { type: 'llm-text', systemPrompt: 'x', writeOutputToFile: file },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'out', format: 'text' }],
    pauseAfter: false,
  };
}

test('BuiltinQualityGates: schema validation blocks empty stages', async () => {
  resetAndRegister();
  const wf = {
    id: 'wf_empty',
    version: '2.0',
    meta: baseMeta(),
  } as unknown as WorkflowDefinition;
  const summary = await runQualityGates('generate', {
    phase: 'generate',
    workflow: wf,
    effectiveTaskType: 'software',
    runtimeRule20On: true,
    generationGates: defaultGates,
  });
  assert.equal(summary.blocks.length, 1);
  assert.equal(summary.blocks[0]?.gateId, GATE_ID_SCHEMA_VALIDATION);
});

test('BuiltinQualityGates: rule20 violations block when runtime verify on', async () => {
  resetAndRegister();
  const wf = rule20ViolationWorkflow();
  const verifyResult = verifyRule20(wf);
  assert.equal(verifyResult.passed, false);
  const summary = await runQualityGates('generate', {
    phase: 'generate',
    workflow: wf,
    effectiveTaskType: 'software',
    runtimeRule20On: true,
    verifyResult,
    generationGates: { ...defaultGates, planCompletenessEnabled: false },
  });
  assert.equal(summary.blocks.some((b) => b.gateId === GATE_ID_RULE20_VIOLATIONS), true);
});

test('BuiltinQualityGates: rule20 violations do not block when runtime verify off', async () => {
  resetAndRegister();
  const wf = rule20ViolationWorkflow();
  const verifyResult = verifyRule20(wf);
  const summary = await runQualityGates('generate', {
    phase: 'generate',
    workflow: wf,
    effectiveTaskType: 'software',
    runtimeRule20On: false,
    verifyResult,
    generationGates: { ...defaultGates, planCompletenessEnabled: false },
  });
  assert.equal(summary.blocks.some((b) => b.gateId === GATE_ID_RULE20_VIOLATIONS), false);
});

test('BuiltinQualityGates: plan completeness blocks missing main assembly', async () => {
  resetAndRegister();
  const wf: WorkflowDefinition = {
    id: 'wf_plan',
    version: '2.0',
    meta: baseMeta(),
    stages: [
      implStage('stage_impl_room_service', 'server/src/services/room.ts'),
      implStage('stage_impl_message_service', 'server/src/services/message.ts'),
      implStage('stage_impl_chat_ui', 'mobile/src/screens/Chat.tsx'),
      implStage('stage_impl_jest_config', 'jest.config.js'),
      {
        id: 'stage_test_run_room',
        title: 'test',
        tool: 'code-runner',
        toolConfig: { type: 'code-runner', command: 'cd server && npm test', captureOutput: true },
        input: { sources: [], mergeStrategy: 'concat' },
        outputs: [{ key: 'out', format: 'text' }],
        pauseAfter: false,
      },
    ],
  };
  const summary = await runQualityGates('generate', {
    phase: 'generate',
    workflow: wf,
    effectiveTaskType: 'software',
    runtimeRule20On: false,
    generationGates: defaultGates,
  });
  assert.equal(summary.blocks.some((b) => b.gateId === GATE_ID_PLAN_COMPLETENESS), true);
});

test('registerBuiltinQualityGates registers generate and pre-stage builtin ids', () => {
  resetAndRegister();
  const ids = getDefaultQualityGateRegistry().list().map((g) => g.id);
  assert.ok(ids.includes(GATE_ID_SCHEMA_VALIDATION));
  assert.ok(ids.includes(GATE_ID_RULE20_VIOLATIONS));
  assert.ok(ids.includes(GATE_ID_PLAN_COMPLETENESS));
});
