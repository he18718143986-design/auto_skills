import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { globalStateKeyForInstance } from '../instance/InstanceGlobalStateKeys';
import type { WorkflowInstance } from '../WorkflowDefinition';
import { buildTaskListItem } from '../WorkflowInstanceQuery';
import {
  listKnownInstanceKeys,
  resolveInstanceForList,
  type InstanceRepositoryContext,
} from '../WorkflowInstanceRepository';

function getTaskListItems(ctx: InstanceRepositoryContext) {
  const list = [];
  const seen = new Set<string>();
  for (const instanceKey of listKnownInstanceKeys(ctx)) {
    const inst = resolveInstanceForList(ctx, instanceKey);
    if (inst && !seen.has(instanceKey)) {
      seen.add(instanceKey);
      list.push(buildTaskListItem(instanceKey, inst));
    }
  }
  return list;
}

function makeCtx(overrides: Partial<InstanceRepositoryContext> = {}): InstanceRepositoryContext {
  const globalState = new Map<string, WorkflowInstance>();
  const keys = [globalStateKeyForInstance('a'), globalStateKeyForInstance('b')];
  return {
    workspaceFolderPath: () => undefined,
    globalStorageFsPath: '/tmp/stagent-global',
    extensionDir: '/tmp/stagent-ext',
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

describe('WorkflowInstanceManager task list query', () => {
  it('getTaskListItems prefers active in-memory instance', () => {
    const inst: WorkflowInstance = {
      definition: {
        id: 'wf',
        version: '2.0',
        meta: { title: 'Active Task', taskType: 'software', userInput: '', createdAt: '' },
        stages: [{ id: 's1', title: 'S', tool: 'llm-text', toolConfig: { type: 'llm-text', systemPrompt: 'x' }, input: { sources: [], mergeStrategy: 'concat' }, outputs: [], pauseAfter: false }],
      },
      currentStageIndex: 0,
      stageRuntimes: [{ stageId: 's1', status: 'pending', outputs: {}, retryCount: 0 }],
      status: 'idle',
    };
    const ctx = makeCtx({
      active: { key: 'active-key', instance: inst },
      globalStateKeys: () => [globalStateKeyForInstance('active-key')],
    });
    const items = getTaskListItems(ctx);
    assert.equal(items.length, 1);
    assert.equal(items[0]!.instanceKey, 'active-key');
    assert.match(items[0]!.title, /Active Task/);
  });
});
