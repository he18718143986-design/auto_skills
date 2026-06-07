import { mock, test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  atomicWriteTextFile,
  atomicWriteTextFileSync,
  pathExists,
  readTextFile,
  readTextFileIfExists,
  writeTextFile,
} from '../FsAsync';
import { appendSessionLogLineAsync } from '../SessionDebugLog';
import { globalStorageInstanceDir } from '../paths/StagentPaths';
import {
  persistInstanceFile,
  persistInstanceFileAsync,
  readInstanceFile,
  readInstanceFileAsync,
} from '../WorkflowPersistence';
import type { WorkflowInstance } from '../WorkflowDefinition';

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'stagent-fs-async-'));
}

test('#7 atomicWriteTextFileSync writes content without leaving tmp files', () => {
  const dir = tempDir();
  const filePath = path.join(dir, 'nested', 'sync-out.txt');
  atomicWriteTextFileSync(filePath, 'hello-sync');
  assert.equal(fs.readFileSync(filePath, 'utf-8'), 'hello-sync');
  const leftovers = fs.readdirSync(path.dirname(filePath)).filter((f) => f.includes('.tmp-'));
  assert.deepEqual(leftovers, []);
});

test('#7 atomicWriteTextFile writes content without leaving tmp files', async () => {
  const dir = tempDir();
  const filePath = path.join(dir, 'nested', 'out.txt');
  await atomicWriteTextFile(filePath, 'hello');
  assert.equal(await readTextFile(filePath), 'hello');
  const leftovers = fs.readdirSync(path.dirname(filePath)).filter((f) => f.includes('.tmp-'));
  assert.deepEqual(leftovers, []);
});

test('#7 readTextFileIfExists returns undefined for missing file', async () => {
  const dir = tempDir();
  assert.equal(await readTextFileIfExists(path.join(dir, 'missing.txt')), undefined);
});

function minimalWorkflowInstance(): WorkflowInstance {
  return {
    traceId: 'trace_test',
    definition: {
      id: 'wf_test',
      version: '2.0',
      meta: {
        title: 't',
        taskType: 'software',
        userInput: 'x',
        createdAt: '2026-05-31T00:00:00.000Z',
      },
      stages: [],
    },
    currentStageIndex: 0,
    status: 'idle',
    stageRuntimes: [],
    artifactRegistry: [],
  };
}

test('#7 persistInstanceFile sync round-trips without tmp leftovers', () => {
  const globalStorage = tempDir();
  const instance = minimalWorkflowInstance();
  persistInstanceFile('inst-sync', instance, undefined, globalStorage);
  const loaded = readInstanceFile('inst-sync', undefined, globalStorage);
  assert.equal(loaded?.traceId, 'trace_test');
  const instDir = globalStorageInstanceDir(globalStorage, 'inst-sync');
  const leftovers = fs.readdirSync(instDir).filter((f) => f.includes('.tmp-'));
  assert.deepEqual(leftovers, []);
});

test('#7 persistInstanceFileAsync round-trips workflow instance', async () => {
  const globalStorage = tempDir();
  const instance = minimalWorkflowInstance();
  await persistInstanceFileAsync('inst-1', instance, undefined, globalStorage);
  const loaded = await readInstanceFileAsync('inst-1', undefined, globalStorage);
  assert.equal(loaded?.traceId, 'trace_test');
  assert.equal(loaded?.status, 'idle');
});

test('#7 appendSessionLogLineAsync appends without blocking sync APIs', async () => {
  const dir = tempDir();
  await appendSessionLogLineAsync(dir, 'line-a');
  await appendSessionLogLineAsync(dir, 'line-b');
  const raw = await readTextFile(path.join(dir, '.session-debug.log'));
  assert.match(raw, /line-a/);
  assert.match(raw, /line-b/);
});

test('#7 readTextFile rejects with fs-read-timeout when read hangs', async () => {
  const dir = tempDir();
  const filePath = path.join(dir, 'hang.txt');
  fs.writeFileSync(filePath, 'x');
  const original = fs.promises.readFile;
  mock.method(fs.promises, 'readFile', () => new Promise(() => undefined));
  try {
    await assert.rejects(readTextFile(filePath, { timeoutMs: 40 }), /fs-read-timeout/);
  } finally {
    mock.restoreAll();
    void original;
  }
});

test('#7 writeTextFile creates parent directories', async () => {
  const dir = tempDir();
  const filePath = path.join(dir, 'a', 'b', 'c.txt');
  await writeTextFile(filePath, 'nested');
  assert.equal(await pathExists(filePath), true);
  assert.equal(await readTextFile(filePath), 'nested');
});
