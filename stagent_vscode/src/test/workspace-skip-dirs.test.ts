import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_WORKSPACE_SKIP_DIR_NAMES } from '../workspace/WorkspaceSkipDirs';

test('DEFAULT_WORKSPACE_SKIP_DIR_NAMES includes key entries', () => {
  for (const name of ['node_modules', '.stagent', '.git', '.venv', '__pycache__', 'coverage']) {
    assert.ok(DEFAULT_WORKSPACE_SKIP_DIR_NAMES.has(name), `missing ${name}`);
  }
});
