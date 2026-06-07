import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  WorkflowExperienceStore,
  withExperienceStoreLock,
  withExperienceStoreLockAsync,
  type WorkflowExperience,
} from '../WorkflowExperienceStore';

function tempStorePath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stagent-exp-lock-'));
  return path.join(dir, 'nested', 'experiences.jsonl');
}

function exp(id: string): WorkflowExperience {
  return { id, timestamp: '2026-05-31T00:00:00.000Z', completionStatus: 'completed' };
}

test('#12 appendSync 原子写：完成后不残留 .tmp 文件', () => {
  const storePath = tempStorePath();
  const store = new WorkflowExperienceStore(storePath);
  store.appendSync(exp('a'));
  store.appendSync(exp('b'));

  const dir = path.dirname(storePath);
  const leftovers = fs.readdirSync(dir).filter((f) => f.includes('.tmp-'));
  assert.deepEqual(leftovers, []);
  assert.deepEqual(
    store.readAll().map((e) => e.id),
    ['a', 'b'],
  );
});

test('#12 appendSync 完成后释放锁文件', () => {
  const storePath = tempStorePath();
  const store = new WorkflowExperienceStore(storePath);
  store.appendSync(exp('a'));
  assert.equal(fs.existsSync(`${storePath}.lock`), false);
});

test('#12 顺序追加在锁保护下不丢条目（含 trim）', () => {
  const storePath = tempStorePath();
  const store = new WorkflowExperienceStore(storePath, 3);
  for (const id of ['a', 'b', 'c', 'd', 'e']) {
    store.appendSync(exp(id));
  }
  // maxEntries=3 → 只保留最近 3 条，FIFO 丢弃最旧
  assert.deepEqual(
    store.readAll().map((e) => e.id),
    ['c', 'd', 'e'],
  );
});

test('#12 withExperienceStoreLock 在持锁时互斥执行临界区', () => {
  const storePath = tempStorePath();
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  const order: string[] = [];
  withExperienceStoreLock(storePath, () => {
    order.push('enter-outer');
    // 锁已被本次持有；模拟极端竞争下另一方等待超时后 best-effort 执行
    withExperienceStoreLock(
      storePath,
      () => {
        order.push('inner-best-effort');
      },
      { maxWaitMs: 30, stepMs: 5 },
    );
    order.push('exit-outer');
  });
  assert.deepEqual(order, ['enter-outer', 'inner-best-effort', 'exit-outer']);
  assert.equal(fs.existsSync(`${storePath}.lock`), false);
});

test('#12 陈旧锁（持有者已崩溃）会被夺取', () => {
  const storePath = tempStorePath();
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  const lockPath = `${storePath}.lock`;
  // 预置一个「陈旧」锁文件并把 mtime 调到过去，模拟崩溃残留
  fs.writeFileSync(lockPath, '', 'utf-8');
  const old = new Date(Date.now() - 60_000);
  fs.utimesSync(lockPath, old, old);

  let ran = false;
  withExperienceStoreLock(
    storePath,
    () => {
      ran = true;
    },
    { staleMs: 1000, maxWaitMs: 2000, stepMs: 5 },
  );
  assert.equal(ran, true);
  assert.equal(fs.existsSync(lockPath), false);
});

test('#12 async append 不丢条目', async () => {
  const storePath = tempStorePath();
  const store = new WorkflowExperienceStore(storePath);
  await store.append(exp('a1'));
  await store.append(exp('a2'));
  const all = await store.readAllAsync();
  assert.deepEqual(
    all.map((e) => e.id),
    ['a1', 'a2'],
  );
});

test('#12 withExperienceStoreLockAsync 互斥', async () => {
  const storePath = tempStorePath();
  const order: string[] = [];
  await withExperienceStoreLockAsync(storePath, async () => {
    order.push('outer');
    await withExperienceStoreLockAsync(
      storePath,
      async () => {
        order.push('inner');
      },
      { maxWaitMs: 30, stepMs: 5 },
    );
    order.push('done');
  });
  assert.deepEqual(order, ['outer', 'inner', 'done']);
});
