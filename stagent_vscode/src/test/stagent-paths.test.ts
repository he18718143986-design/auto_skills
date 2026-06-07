import assert from 'node:assert/strict';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  adrDir,
  contextMdPath,
  EXPERIENCES_FILENAME,
  experiencesPath,
  generatedArtifactRelativePath,
  GLOBAL_FAILURES_FILENAME,
  INSTANCE_INDEX_FILE,
  moduleMapRelativePath,
  globalFailureLogsDir,
  globalStorageInstanceDir,
  instancesRootUnderGlobalStorage,
  instancesRootUnderWorkspace,
  promptVersionsPath,
  SESSION_DEBUG_FILENAME,
  STAGENT_ADR_DIR,
  STAGENT_DIR,
  stagentDir,
  taskDebugLogPath,
  taskInstanceDir,
  WF_DEBUG_FILENAME,
  WF_FAILURES_FILENAME,
  WF_STATE_FILE_NAME,
} from '../paths/StagentPaths';

const root = path.join('/workspace', 'proj');

test('stagentDir and taskInstanceDir use platform separators', () => {
  assert.equal(stagentDir(root), path.join(root, STAGENT_DIR));
  assert.equal(taskInstanceDir(root, 'abc'), path.join(root, STAGENT_DIR, 'instances', 'abc'));
});

test('contextMdPath and promptVersionsPath', () => {
  assert.equal(contextMdPath(root), path.join(root, STAGENT_DIR, 'CONTEXT.md'));
  assert.equal(promptVersionsPath(root), path.join(root, STAGENT_DIR, 'prompt-versions.json'));
});

test('experiencesPath joins experiences filename', () => {
  assert.equal(
    experiencesPath(root, EXPERIENCES_FILENAME),
    path.join(root, STAGENT_DIR, EXPERIENCES_FILENAME),
  );
});

test('generatedArtifactRelativePath uses forward slashes', () => {
  assert.equal(generatedArtifactRelativePath('stage_impl_1'), '.stagent/generated/stage_impl_1.md');
});

test('moduleMapRelativePath', () => {
  assert.equal(moduleMapRelativePath(), '.stagent/module-map.md');
});

test('disk filename constants', () => {
  assert.equal(WF_STATE_FILE_NAME, '.wf-state.json');
  assert.equal(EXPERIENCES_FILENAME, 'experiences.jsonl');
  assert.equal(INSTANCE_INDEX_FILE, 'index.json');
  assert.equal(WF_FAILURES_FILENAME, '.wf-failures.jsonl');
  assert.equal(GLOBAL_FAILURES_FILENAME, 'failures.jsonl');
  assert.equal(SESSION_DEBUG_FILENAME, '.session-debug.log');
  assert.equal(WF_DEBUG_FILENAME, '.wf-debug.log');
});

test('taskDebugLogPath joins task dir and wf debug filename', () => {
  const taskDir = path.join(root, STAGENT_DIR, 'instances', 'abc');
  assert.equal(taskDebugLogPath(taskDir), path.join(taskDir, WF_DEBUG_FILENAME));
});

test('global storage layout helpers', () => {
  const gs = '/tmp/ext-global';
  assert.equal(
    instancesRootUnderGlobalStorage(gs),
    path.join(gs, 'instances'),
  );
  assert.equal(globalStorageInstanceDir(gs, 'id1'), path.join(gs, 'instances', 'id1'));
  assert.equal(globalFailureLogsDir(gs), path.join(gs, 'failure-logs'));
});

test('instancesRootUnderWorkspace and adrDir', () => {
  assert.equal(instancesRootUnderWorkspace(root), path.join(root, STAGENT_DIR, 'instances'));
  assert.equal(adrDir(root), path.join(root, STAGENT_DIR, 'adr'));
  assert.equal(STAGENT_ADR_DIR, `${STAGENT_DIR}/adr`);
});
