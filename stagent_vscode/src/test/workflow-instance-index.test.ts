import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { stagentDir, taskInstanceDir } from '../paths/StagentPaths';
import {
  readInstanceIndex,
  upsertInstanceIndexEntry,
  removeInstanceIndexEntry,
} from '../WorkflowInstanceIndex';

describe('WorkflowInstanceIndex', () => {
  it('upsert and remove index entries', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stagent-index-'));
    upsertInstanceIndexEntry(root, {
      instanceKey: 'k1',
      taskDir: taskInstanceDir(root, 'k1'),
      title: 'Test',
      updatedAt: '2026-01-01T00:00:00.000Z',
      status: 'draft',
    });
    const entries = readInstanceIndex(root);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].instanceKey, 'k1');
    const stagentRoot = stagentDir(root);
    const leftovers = fs.readdirSync(stagentRoot).filter((f) => f.includes('.tmp-'));
    assert.deepEqual(leftovers, []);
    removeInstanceIndexEntry(root, 'k1');
    assert.equal(readInstanceIndex(root).length, 0);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
