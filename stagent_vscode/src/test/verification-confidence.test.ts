import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  applyVerificationConfidence,
  isVerificationStage,
  VERIFICATION_PASS_CONFIDENCE_SCORE,
} from '../quality-gates/verificationConfidence';
import { CONFIDENCE_OUTPUT_KEY, CODE_RUNNER_EXIT_OUTPUT_KEY } from '../WorkflowOutputKeys';
import type { Stage, StageRuntime } from '../WorkflowDefinition';
import { SMOKE_RUN_STAGE_ID } from '../disk-bootstrap/smokeStage';

function codeRunnerStage(id: string): Stage {
  return {
    id,
    title: id,
    tool: 'code-runner',
    toolConfig: { type: 'code-runner', command: 'npm test', captureOutput: true },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'main', format: 'text' }],
    pauseAfter: false,
  };
}

test('isVerificationStage matches test_run and smoke', () => {
  assert.equal(isVerificationStage(codeRunnerStage('stage_test_run_x')), true);
  assert.equal(isVerificationStage(codeRunnerStage(SMOKE_RUN_STAGE_ID)), true);
  assert.equal(isVerificationStage(codeRunnerStage('stage_impl_x')), false);
});

test('applyVerificationConfidence sets high score on exit 0', () => {
  const stage = codeRunnerStage('stage_test_run_unit');
  const runtime: StageRuntime = {
    stageId: stage.id,
    status: 'done',
    retryCount: 0,
    outputs: { [CODE_RUNNER_EXIT_OUTPUT_KEY]: 0 },
  };
  const result = applyVerificationConfidence(stage, runtime);
  assert.equal(result?.score, VERIFICATION_PASS_CONFIDENCE_SCORE);
  assert.equal(result?.level, 'high');
  const stored = runtime.outputs[CONFIDENCE_OUTPUT_KEY] as { score: number };
  assert.equal(stored.score, VERIFICATION_PASS_CONFIDENCE_SCORE);
});

test('applyVerificationConfidence skips non-zero exit', () => {
  const stage = codeRunnerStage('stage_test_run_unit');
  const runtime: StageRuntime = {
    stageId: stage.id,
    status: 'done',
    retryCount: 0,
    outputs: { [CODE_RUNNER_EXIT_OUTPUT_KEY]: 1 },
  };
  assert.equal(applyVerificationConfidence(stage, runtime), undefined);
});
