import assert from 'node:assert/strict';
import * as path from 'node:path';
import { test } from 'node:test';
import { experiencesPath, stagentDir, taskInstanceDir } from '../paths/StagentPaths';
import { EXPERIENCES_FILENAME } from '../WorkflowExperienceStore';
import { isStagentInstanceStateDir } from '../paths/StagentInstancePathGuards';

test('isStagentInstanceStateDir matches .stagent/instances and bare instances', () => {
  const root = path.join('/proj', 'task');
  assert.ok(isStagentInstanceStateDir(taskInstanceDir(root, 'id1')));
  assert.ok(isStagentInstanceStateDir(path.join('/global', 'instances', 'id2')));
  assert.ok(!isStagentInstanceStateDir(experiencesPath(root, EXPERIENCES_FILENAME)));
});
