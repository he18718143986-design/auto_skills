import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import {
  collectInstanceKeysFromDiskRoots,
  discoverInstanceRootsUnderDir,
  listInstanceKeysUnderRoot,
  readInstanceFromDiskRoots,
} from '../WorkflowInstanceDiskIndex';
import { taskInstanceDir } from '../paths/StagentPaths';
import { WF_STATE_FILE_NAME } from '../WorkflowInstancePersistenceSync';

describe('WorkflowInstanceDiskIndex', () => {
  it('lists instance keys when state file exists', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stagent-inst-'));
    const id = '11111111-1111-4111-8111-111111111111';
    const dir = path.join(root, id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, WF_STATE_FILE_NAME),
      JSON.stringify({ definition: { id: 'wf' }, status: 'running', currentStageIndex: 0, stageRuntimes: [] }),
      'utf-8',
    );
    assert.deepStrictEqual(listInstanceKeysUnderRoot(root), [id]);
    const keys = collectInstanceKeysFromDiskRoots([root]);
    assert.deepStrictEqual(keys, [id]);
    const inst = readInstanceFromDiskRoots(id, [root]);
    assert.strictEqual(inst?.status, 'running');
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('discovers task/05 style nested instance roots', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'stagent-task-'));
    const task05 = path.join(base, 'task', '05');
    const id = '7415eb95-64e9-43c3-b763-bdd37ef37561';
    const instDir = taskInstanceDir(task05, id);
    fs.mkdirSync(instDir, { recursive: true });
    fs.writeFileSync(
      path.join(instDir, WF_STATE_FILE_NAME),
      JSON.stringify({
        definition: {
          id: 'wf',
          version: '2.0',
          meta: { title: 't', taskType: 'auto', userInput: '', createdAt: '', taskWorkspacePath: task05 },
          stages: [],
        },
        status: 'completed',
        currentStageIndex: 0,
        stageRuntimes: [],
      }),
      'utf-8',
    );
    const roots = discoverInstanceRootsUnderDir(path.join(base, 'task'));
    assert.strictEqual(roots.length, 1);
    assert.ok(roots[0]!.endsWith(`${path.sep}05${path.sep}.stagent${path.sep}instances`));
    const keys = collectInstanceKeysFromDiskRoots(roots);
    assert.deepStrictEqual(keys, [id]);
    fs.rmSync(base, { recursive: true, force: true });
  });
});
