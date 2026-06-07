import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  GENERATION_OPERATION_POLISH,
  GENERATION_OPERATION_WORKFLOW,
} from '../generation/GenerationOperationIds';
import { WORKFLOW_LEVEL_STAGE_ID } from '../workflow/WorkflowLevelIds';

describe('GenerationOperationIds', () => {
  it('keeps stable string values for message protocol compatibility', () => {
    assert.equal(GENERATION_OPERATION_WORKFLOW, 'workflow');
    assert.equal(GENERATION_OPERATION_POLISH, 'polish');
  });

  it('shares workflow literal with WORKFLOW_LEVEL_STAGE_ID but is a separate constant', () => {
    assert.equal(GENERATION_OPERATION_WORKFLOW, WORKFLOW_LEVEL_STAGE_ID);
    assert.notEqual(GENERATION_OPERATION_WORKFLOW, GENERATION_OPERATION_POLISH);
  });
});
