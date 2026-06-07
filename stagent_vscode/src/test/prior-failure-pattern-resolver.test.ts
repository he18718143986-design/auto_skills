import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  formatPriorFailurePattern,
  resolvePriorFailurePattern,
} from '../PriorFailurePatternResolver';
import { experiencesPath } from '../paths/StagentPaths';
import { appendWorkflowExperienceAsync, EXPERIENCES_FILENAME } from '../WorkflowExperienceStore';
import type { WorkflowExperience } from '../WorkflowExperienceStore';

function baseExperience(overrides: Partial<WorkflowExperience>): WorkflowExperience {
  return {
    id: 'exp-1',
    timestamp: new Date().toISOString(),
    taskType: 'software',
    completionStatus: 'failed',
    ...overrides,
  };
}

test('resolvePriorFailurePattern returns undefined when disabled', async () => {
  const result = await resolvePriorFailurePattern({
    taskType: 'software',
    stageId: 'stage_impl_foo',
    workspaceRoot: '/tmp',
    enabled: false,
  });
  assert.equal(result, undefined);
});

test('resolvePriorFailurePattern picks highest frequency pattern', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stagent-prior-'));
  const storePath = experiencesPath(tmp, EXPERIENCES_FILENAME);
  await appendWorkflowExperienceAsync(
    storePath,
    baseExperience({
      id: 'e1',
      failureStageId: 'stage_impl_foo_bar',
      failureErrorType: 'tool-execution-failed',
    }),
  );
  await appendWorkflowExperienceAsync(
    storePath,
    baseExperience({
      id: 'e2',
      failureStageId: 'stage_impl_foo_bar',
      failureErrorType: 'tool-execution-failed',
    }),
  );
  await appendWorkflowExperienceAsync(
    storePath,
    baseExperience({
      id: 'e3',
      failureStageId: 'stage_impl_foo_qux',
      failureErrorType: 'llm-invalid-output',
    }),
  );

  const result = await resolvePriorFailurePattern({
    taskType: 'software',
    stageId: 'stage_impl_foo_new',
    workspaceRoot: tmp,
    enabled: true,
  });
  assert.ok(result);
  assert.ok(result!.includes('tool-execution-failed'));
  assert.ok(result!.includes('(2x)'));
});

test('formatPriorFailurePattern', () => {
  assert.equal(
    formatPriorFailurePattern({
      patternId: 'x',
      frequency: 3,
      stageIdPattern: 'stage_impl_foo',
      errorType: 'unknown',
      commonContext: 'c',
    }),
    'unknown@stage_impl_foo (3x)',
  );
});
