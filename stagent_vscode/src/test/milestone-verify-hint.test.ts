import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { buildMilestoneVerifyHint } from '../friendly/milestoneVerifyHint';
import { SMOKE_RUN_STAGE_ID } from '../disk-bootstrap/smokeStage';
import type { Stage, StageRuntime, WorkflowDefinition } from '../WorkflowDefinition';

test('buildMilestoneVerifyHint includes last passing test_run command', () => {
  const definition: WorkflowDefinition = {
    id: 'wf',
    version: '2.0',
    meta: { title: 't', taskType: 'software', userInput: 'u', createdAt: new Date().toISOString() },
    stages: [
      {
        id: 'stage_test_run_unit',
        title: 't',
        tool: 'code-runner',
        toolConfig: { type: 'code-runner', command: 'npm test', captureOutput: true },
        input: { sources: [], mergeStrategy: 'concat' },
        outputs: [{ key: 'main', format: 'text' }],
        pauseAfter: false,
      },
    ],
  };
  const instance = {
    definition,
    stageRuntimes: [
      { stageId: 'stage_test_run_unit', status: 'done' as const, retryCount: 0, outputs: {} },
    ],
    currentStageIndex: 1,
    status: 'completed' as const,
  };
  const hint = buildMilestoneVerifyHint(instance);
  assert.ok(hint?.includes('npm test'));
});

test('buildMilestoneVerifyHint notes smoke pass', () => {
  const smoke: Stage = {
    id: SMOKE_RUN_STAGE_ID,
    title: 'smoke',
    tool: 'code-runner',
    toolConfig: { type: 'code-runner', command: 'npm start', serve: true, captureOutput: true },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'main', format: 'text' }],
    pauseAfter: false,
  };
  const definition: WorkflowDefinition = {
    id: 'wf',
    version: '2.0',
    meta: { title: 't', taskType: 'software', userInput: 'u', createdAt: new Date().toISOString() },
    stages: [smoke],
  };
  const instance = {
    definition,
    stageRuntimes: [
      { stageId: SMOKE_RUN_STAGE_ID, status: 'done' as const, retryCount: 0, outputs: {} },
    ],
    currentStageIndex: 1,
    status: 'completed' as const,
  };
  const hint = buildMilestoneVerifyHint(instance);
  assert.ok(hint?.includes('冒烟自检'));
});
