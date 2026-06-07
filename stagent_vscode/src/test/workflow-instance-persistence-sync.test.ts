import * as assert from 'node:assert';
import { describe, it } from 'node:test';
import type { WorkflowInstance } from '../WorkflowDefinition';
import {
  resolveInstanceForTaskList,
  resolveInstanceLoadSync,
} from '../WorkflowInstancePersistenceSync';

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

describe('resolveInstanceLoadSync', () => {
  it('purges when globalState exists but disk file missing', () => {
    const r = resolveInstanceLoadSync({
      globalStateInstance: minimalInstance('a'),
      diskStateFileExists: false,
    });
    assert.strictEqual(r.kind, 'purge_global');
  });

  it('prefers disk when persistRevision is newer than globalState', () => {
    const gs = minimalInstance('a');
    gs.persistRevision = 1;
    gs.status = 'running';
    const file = minimalInstance('a');
    file.persistRevision = 3;
    file.status = 'paused';
    const r = resolveInstanceLoadSync({
      globalStateInstance: gs,
      diskInstance: file,
      diskStateFileExists: true,
    });
    assert.strictEqual(r.kind, 'loaded');
    if (r.kind === 'loaded') {
      assert.strictEqual(r.instance.status, 'paused');
      assert.strictEqual(r.instance.persistRevision, 3);
      assert.strictEqual(r.promoteToGlobalState, true);
    }
  });

  it('prefers globalState when persistRevision is newer or equal', () => {
    const gs = minimalInstance('a');
    gs.persistRevision = 5;
    gs.status = 'running';
    const file = minimalInstance('a');
    file.persistRevision = 3;
    file.status = 'paused';
    const r = resolveInstanceLoadSync({
      globalStateInstance: gs,
      diskInstance: file,
      diskStateFileExists: true,
    });
    assert.strictEqual(r.kind, 'loaded');
    if (r.kind === 'loaded') {
      assert.strictEqual(r.instance.status, 'running');
      assert.strictEqual(r.promoteToGlobalState, false);
    }
  });
});

describe('resolveInstanceForTaskList', () => {
  it('returns globalState instance without purge when disk missing', () => {
    const gs = minimalInstance('a');
    const r = resolveInstanceForTaskList({ globalStateInstance: gs });
    assert.strictEqual(r.instance, gs);
    assert.strictEqual(r.promoteToGlobalState, false);
  });

  it('promotes disk-only instance', () => {
    const file = minimalInstance('b');
    const r = resolveInstanceForTaskList({ diskInstance: file });
    assert.strictEqual(r.instance, file);
    assert.strictEqual(r.promoteToGlobalState, true);
  });
});
