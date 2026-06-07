import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import type { WorkflowInstance } from '../WorkflowDefinition';
import {
  flushInstanceSaveAsync,
  persistInstanceSnapshotSync,
  type PersistenceBridgeDeps,
} from '../WorkflowEnginePersistenceBridge';

function minimalInstance(id: string): WorkflowInstance {
  return {
    definition: {
      id,
      version: '2.0',
      meta: { title: id, taskType: 'auto', userInput: '', createdAt: '2026-01-01T00:00:00Z' },
      stages: [],
    },
    status: 'running',
    currentStageIndex: 0,
    stageRuntimes: [],
  };
}

function baseDeps(overrides: Partial<PersistenceBridgeDeps> = {}): PersistenceBridgeDeps {
  return {
    workspaceFolderPath: () => '/tmp/ws',
    globalStorageFsPath: '/tmp/gs',
    updateGlobalState: async () => {},
    warn: () => {},
    degraded: () => {},
    notifyInstancesChanged: () => {},
    ...overrides,
  };
}

test('flushInstanceSaveAsync writes disk before globalState', async () => {
  const order: string[] = [];

  await flushInstanceSaveAsync(
    baseDeps({
      persistInstanceAsync: async () => {
        order.push('disk');
      },
      updateGlobalState: async () => {
        order.push('globalState');
      },
      notifyInstancesChanged: () => order.push('notify'),
    }),
    'key_a',
    minimalInstance('key_a'),
  );
  await new Promise((r) => setTimeout(r, 50));

  assert.deepEqual(order.slice(0, 2), ['disk', 'globalState']);
});

test('flushInstanceSaveAsync skips globalState when disk persist fails', async () => {
  const order: string[] = [];
  const degradedEvents: string[] = [];

  await flushInstanceSaveAsync(
    baseDeps({
      persistInstanceAsync: async () => {
        order.push('disk');
        throw new Error('disk full');
      },
      updateGlobalState: async () => {
        order.push('globalState');
      },
      degraded: (reason) => degradedEvents.push(reason),
    }),
    'key_b',
    minimalInstance('key_b'),
  );
  await new Promise((r) => setTimeout(r, 50));

  assert.deepEqual(order, ['disk']);
  assert.ok(degradedEvents.includes('state_file_persist_failed'));
});

test('persistInstanceSnapshotSync writes disk before globalState', async () => {
  const order: string[] = [];

  persistInstanceSnapshotSync(
    baseDeps({
      persistInstanceSync: () => {
        order.push('disk');
      },
      updateGlobalState: async () => {
        order.push('globalState');
      },
    }),
    'key_c',
    minimalInstance('key_c'),
  );
  await new Promise((r) => setTimeout(r, 50));

  assert.deepEqual(order.slice(0, 2), ['disk', 'globalState']);
});
