import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { buildQualityReportPayload } from '../quality-report/buildQualityReportPayload';
import type { WorkflowDefinition, WorkflowInstance } from '../WorkflowDefinition';
import { VERIFICATION_RUNS_OUTPUT_KEY } from '../WorkflowOutputKeys';

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

function minimalCompletedInstance(): WorkflowInstance {
  return {
    status: 'completed',
    currentStageIndex: 1,
    definition: verificationWorkflow(),
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
  };
}

test('buildQualityReportPayload: includes afk and verification rows', () => {
  const report = buildQualityReportPayload(minimalCompletedInstance());
  assert.equal(report.verificationRows.length, 1);
  assert.equal(report.verificationRows[0]!.stageId, 'stage_test_run_unit');
  assert.equal(report.verificationRows[0]!.stable, true);
  assert.ok(typeof report.afk.verificationStages === 'number');
  assert.ok(report.engineSummary.length > 0);
});
