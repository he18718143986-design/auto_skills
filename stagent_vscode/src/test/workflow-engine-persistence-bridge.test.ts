import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import type { WorkflowInstance } from '../WorkflowDefinition';
import {
  flushInstanceSaveAsync,
  persistInstanceSnapshotSync,
  type PersistenceBridgeDeps,
} from '../WorkflowEnginePersistenceBridge';
import { WF_STATE_FILE_NAME } from '../WorkflowInstancePersistenceSync';

function minimalInstance(): WorkflowInstance {
  return {
    definition: {
      id: 'wf',
      version: '2.0',
      meta: { title: 't', taskType: 'software', userInput: 'u', createdAt: '2020' },
      stages: [],
    },
    stageRuntimes: [],
    status: 'running',
    currentStageIndex: 0,
  };
}

test('flushInstanceSaveAsync writes disk before globalState', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stagent-bridge-'));
  const order: string[] = [];
  const deps: PersistenceBridgeDeps = {
    workspaceFolderPath: () => tmp,
    globalStorageFsPath: path.join(tmp, 'global'),
    updateGlobalState: async () => {
      order.push('globalState');
    },
    warn: () => {},
    degraded: () => {},
    notifyInstancesChanged: () => {},
  };
  fs.mkdirSync(path.join(tmp, '.stagent', 'instances', 'key-1'), { recursive: true });
  await flushInstanceSaveAsync(deps, 'key-1', minimalInstance());
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(order, ['globalState']);
  const statePath = path.join(tmp, '.stagent', 'instances', 'key-1', WF_STATE_FILE_NAME);
  assert.ok(fs.existsSync(statePath), 'disk state should exist before globalState update');
});

test('persistInstanceSnapshotSync skips globalState when disk write fails', () => {
  const degradedEvents: string[] = [];
  let globalCalls = 0;
  const deps: PersistenceBridgeDeps = {
    workspaceFolderPath: () => '/nonexistent-root-that-cannot-write',
    globalStorageFsPath: '/tmp',
    updateGlobalState: async () => {
      globalCalls += 1;
    },
    warn: () => {},
    degraded: (reason) => degradedEvents.push(reason),
    notifyInstancesChanged: () => {},
  };
  persistInstanceSnapshotSync(deps, 'key-1', minimalInstance());
  assert.equal(globalCalls, 0);
  assert.ok(degradedEvents.includes('persist_instance_snapshot_failed'));
});

test('flushInstanceSaveAsync calls onGlobalStateFailed when globalState update fails', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stagent-bridge-gs-'));
  const failedKeys: string[] = [];
  const deps: PersistenceBridgeDeps = {
    workspaceFolderPath: () => tmp,
    globalStorageFsPath: path.join(tmp, 'global'),
    updateGlobalState: async () => {
      throw new Error('globalState quota');
    },
    warn: () => {},
    degraded: () => {},
    notifyInstancesChanged: () => {},
    onGlobalStateFailed: (key) => failedKeys.push(key),
  };
  fs.mkdirSync(path.join(tmp, '.stagent', 'instances', 'key-gs'), { recursive: true });
  await flushInstanceSaveAsync(deps, 'key-gs', minimalInstance());
  await new Promise((r) => setTimeout(r, 450));
  assert.deepEqual(failedKeys, ['key-gs']);
  const statePath = path.join(tmp, '.stagent', 'instances', 'key-gs', WF_STATE_FILE_NAME);
  assert.ok(fs.existsSync(statePath));
});
