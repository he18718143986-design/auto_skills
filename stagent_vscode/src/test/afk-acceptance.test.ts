import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { evaluateAfkAcceptance } from '../afk/evaluateAfkAcceptance';
import { RUNTIME_REPLAN_OUTPUT_KEY } from '../runtime-replan/constants';
import { VERIFICATION_RUNS_OUTPUT_KEY } from '../WorkflowOutputKeys';
import type { WorkflowDefinition } from '../WorkflowDefinition';

function verificationWorkflow(): WorkflowDefinition {
  return {
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
}

test('evaluateAfkAcceptance passes stable verification with zero human touch', () => {
  const definition = verificationWorkflow();
  const report = evaluateAfkAcceptance({
    definition,
    stageRuntimes: [
      {
        stageId: 'stage_test_run_unit',
        status: 'done',
        retryCount: 0,
        outputs: {
          [VERIFICATION_RUNS_OUTPUT_KEY]: [
            { attempt: 1, exitCode: 0 },
            { attempt: 2, exitCode: 0 },
          ],
        },
      },
    ],
    currentStageIndex: 1,
    status: 'completed',
  });
  assert.equal(report.passed, true);
  assert.equal(report.verificationStages, 1);
});

test('evaluateAfkAcceptance fails on flaky verification', () => {
  const definition = verificationWorkflow();
  const report = evaluateAfkAcceptance({
    definition,
    stageRuntimes: [
      {
        stageId: 'stage_test_run_unit',
        status: 'done',
        retryCount: 0,
        outputs: {
          [VERIFICATION_RUNS_OUTPUT_KEY]: [
            { attempt: 1, exitCode: 0 },
            { attempt: 2, exitCode: 1 },
          ],
        },
      },
    ],
    currentStageIndex: 1,
    status: 'completed',
  });
  assert.equal(report.passed, false);
  assert.ok(report.flakyStages.includes('stage_test_run_unit'));
});

test('evaluateAfkAcceptance reports runtimeReplanCount without counting as humanInterventions', () => {
  const definition = verificationWorkflow();
  const report = evaluateAfkAcceptance({
    definition,
    stageRuntimes: [
      {
        stageId: 'stage_test_run_unit',
        status: 'done',
        retryCount: 0,
        outputs: {
          [VERIFICATION_RUNS_OUTPUT_KEY]: [
            { attempt: 1, exitCode: 0 },
            { attempt: 2, exitCode: 0 },
          ],
          [RUNTIME_REPLAN_OUTPUT_KEY]: {
            attempts: 2,
            perSlice: { unit: 1 },
            insertedStageIds: ['stage_runtime_replan_fix_unit'],
            lastTrigger: 'fix-exhausted',
          },
        },
      },
    ],
    currentStageIndex: 1,
    status: 'completed',
  });
  assert.equal(report.runtimeReplanCount, 2);
  assert.equal(report.humanInterventions, 0);
  assert.equal(report.passed, true);
});
