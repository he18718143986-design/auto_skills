import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  WORKFLOW_CONFIG_LEVEL_STAGE_ID,
  WORKFLOW_LEVEL_STAGE_ID,
} from '../workflow/WorkflowLevelIds';

test('workflow level stage id constants are stable', () => {
  assert.equal(WORKFLOW_LEVEL_STAGE_ID, 'workflow');
  assert.equal(WORKFLOW_CONFIG_LEVEL_STAGE_ID, 'globalConfig');
});
