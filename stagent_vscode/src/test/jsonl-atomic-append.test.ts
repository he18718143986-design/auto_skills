import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  appendJsonlLineAtomicSync,
  appendLogLineAtomicSync,
} from '../jsonl/JsonlAtomicAppend';

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'stagent-jsonl-'));
}

test('appendJsonlLineAtomicSync appends parseable lines without tmp leftovers', () => {
  const dir = tempDir();
  const filePath = path.join(dir, 'failures.jsonl');
  appendJsonlLineAtomicSync(filePath, JSON.stringify({ a: 1 }));
  appendJsonlLineAtomicSync(filePath, JSON.stringify({ b: 2 }));
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.trim().split('\n');
  assert.equal(lines.length, 2);
  assert.deepEqual(JSON.parse(lines[0]!), { a: 1 });
  assert.deepEqual(JSON.parse(lines[1]!), { b: 2 });
  const leftovers = fs.readdirSync(dir).filter((f) => f.includes('.tmp-'));
  assert.deepEqual(leftovers, []);
});

test('appendLogLineAtomicSync rotates when exceeding maxBytes', () => {
  const dir = tempDir();
  const filePath = path.join(dir, 'rot.log');
  const maxBytes = 80;
  appendLogLineAtomicSync(filePath, 'x'.repeat(50), { maxBytes });
  appendLogLineAtomicSync(filePath, 'y'.repeat(50), { maxBytes });
  assert.ok(fs.existsSync(`${filePath}.1`));
  assert.match(fs.readFileSync(filePath, 'utf-8'), /y+/);
});
