import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import { taskInstanceDir } from '../paths/StagentPaths';
import { globalStateKeyForInstance } from '../instance/InstanceGlobalStateKeys';
import type { WorkflowInstance } from '../WorkflowDefinition';
import {
  collectInstanceDiskRoots,
  deleteInstanceRecord,
  instanceTaskDirHint,
  listKnownInstanceKeys,
  loadInstanceByKey,
  resolveReuseInstance,
  type InstanceRepositoryContext,
} from '../WorkflowInstanceRepository';
import { WF_STATE_FILE_NAME } from '../WorkflowInstancePersistenceSync';

function makeCtx(overrides: Partial<InstanceRepositoryContext> = {}): InstanceRepositoryContext {
  const globalState = new Map<string, WorkflowInstance>();
  const keys = [globalStateKeyForInstance('a'), globalStateKeyForInstance('b')];
  return {
    workspaceFolderPath: () => undefined,
    globalStorageFsPath: path.join(os.tmpdir(), 'stagent-global'),
    extensionDir: path.join(os.tmpdir(), 'stagent-ext'),
    globalStateKeys: () => keys,
    getGlobalStateInstance: (k) => globalState.get(k),
    updateGlobalState: async (k, v) => {
      if (v === undefined) {
        globalState.delete(k);
      } else {
        globalState.set(k, v);
      }
    },
    warn: () => {},
    notifyInstancesChanged: () => {},
    ...overrides,
  };
}

describe('WorkflowInstanceRepository', () => {
  it('instanceTaskDirHint extracts taskDir and taskWorkspacePath', () => {
    const hint = instanceTaskDirHint({
      taskDir: '/tmp/task/.stagent/instances/id',
      definition: {
        id: 'wf',
        version: '2.0',
        meta: { title: 't', taskType: 'software', userInput: '', createdAt: '', taskWorkspacePath: '/tmp/task' },
        stages: [],
      },
      currentStageIndex: 0,
      stageRuntimes: [],
      status: 'idle',
    });
    assert.equal(hint?.taskDir, '/tmp/task/.stagent/instances/id');
    assert.equal(hint?.taskWorkspacePath, '/tmp/task');
  });

  it('resolveReuseInstance reuses idle instance with taskDir', () => {
    const existing: WorkflowInstance = {
      definition: { id: 'wf', version: '2.0', meta: { title: 't', taskType: 'software', userInput: '', createdAt: '' }, stages: [] },
      currentStageIndex: 0,
      stageRuntimes: [],
      status: 'idle',
      taskDir: '/tmp/x',
    };
    const ctx = makeCtx();
    const out = resolveReuseInstance(ctx, 'key-1', 'key-1', existing);
    assert.equal(out.reuse, true);
    assert.equal(out.instanceId, 'key-1');
    assert.strictEqual(out.existing, existing);
  });

  it('resolveReuseInstance mints new id when no reusable instance', () => {
    const ctx = makeCtx();
    const out = resolveReuseInstance(ctx, 'missing', undefined, undefined);
    assert.equal(out.reuse, false);
    assert.notEqual(out.instanceId, 'missing');
  });

  it('listKnownInstanceKeys merges globalState keys with disk scan', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stagent-repo-'));
    const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const instDir = taskInstanceDir(root, id);
    fs.mkdirSync(instDir, { recursive: true });
    fs.writeFileSync(
      path.join(instDir, WF_STATE_FILE_NAME),
      JSON.stringify({
        definition: { id: 'wf', version: '2.0', meta: { title: 't', taskType: 'software', userInput: '', createdAt: '' }, stages: [] },
        status: 'completed',
        currentStageIndex: 0,
        stageRuntimes: [],
      }),
      'utf-8',
    );
    const ctx = makeCtx({
      workspaceFolderPath: () => root,
      globalStateKeys: () => [],
    });
    const roots = collectInstanceDiskRoots(ctx);
    assert.ok(roots.some((r) => r.endsWith('.stagent/instances') || r.includes(`${path.sep}.stagent${path.sep}instances`)));
    const keys = listKnownInstanceKeys(ctx);
    assert.ok(keys.includes(id));
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('deleteInstanceRecord clears active flag when deleting current key', () => {
    const ctx = makeCtx({ active: { key: 'del-me' } });
    const result = deleteInstanceRecord(ctx, 'del-me', 'record');
    assert.equal(result.clearedActive, true);
  });

  it('loadInstanceByKey returns undefined for absent instance', () => {
    const ctx = makeCtx({ globalStateKeys: () => [] });
    assert.equal(loadInstanceByKey(ctx, 'nonexistent'), undefined);
  });
});
