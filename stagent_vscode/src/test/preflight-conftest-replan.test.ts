import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import type { WorkflowInstance } from '../WorkflowDefinition';
import { planDeterministicReplan } from '../runtime-replan/planDeterministicReplan';
import { isPreflightConftestBlock } from '../runtime-replan/PreflightReplanRouter';
import { GATE_ID_TEST_RUN_PREFLIGHT } from '../QualityGateIds';

function minimalInstance(): WorkflowInstance {
  return {
    definition: {
      id: 'wf',
      version: '2.0',
      meta: { title: 't', taskType: 'software', userInput: 'x', createdAt: new Date().toISOString() },
      stages: [
        { id: 'stage_impl_calc', title: 'impl', tool: 'llm-text', toolConfig: { type: 'llm-text', systemPrompt: 'x' }, input: { sources: [], mergeStrategy: 'concat' }, outputs: [], pauseAfter: false },
        { id: 'stage_test_run_calc', title: 'run', tool: 'code-runner', toolConfig: { type: 'code-runner', command: 'pytest', captureOutput: true }, input: { sources: [], mergeStrategy: 'concat' }, outputs: [], pauseAfter: false },
      ],
    },
    stageRuntimes: [
      { stageId: 'stage_impl_calc', status: 'done', outputs: {}, retryCount: 0 },
      { stageId: 'stage_test_run_calc', status: 'pending', outputs: {}, retryCount: 0 },
    ],
    currentStageIndex: 1,
    status: 'running',
    taskDir: '/tmp',
  } as WorkflowInstance;
}

test('isPreflightConftestBlock detects missing-python-flat-layout', () => {
  assert.equal(
    isPreflightConftestBlock({
      gateId: GATE_ID_TEST_RUN_PREFLIGHT,
      severity: 'block',
      messages: ['flat layout'],
      meta: { issue: { code: 'missing-python-flat-layout', message: 'm', hint: 'h' } },
    }),
    true,
  );
});

test('planDeterministicReplan inserts conftest stage for preflight-conftest trigger', () => {
  const instance = minimalInstance();
  const action = planDeterministicReplan({
    instance,
    trigger: {
      kind: 'preflight-conftest',
      testRunStageId: 'stage_test_run_calc',
      sliceSemantic: 'calc',
      message: 'missing conftest',
    },
  });
  assert.ok(action);
  assert.ok(action!.stage.id.includes('conftest'));
  assert.equal(action!.anchorStageId, 'stage_impl_calc');
});
