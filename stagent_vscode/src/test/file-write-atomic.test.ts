import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { atomicWriteTextFile } from '../FsAsync';

test('atomicWriteTextFile leaves no tmp files in target directory', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stagent-atomic-write-'));
  const filePath = path.join(dir, 'out.txt');
  await atomicWriteTextFile(filePath, 'hello');
  assert.equal(fs.readFileSync(filePath, 'utf-8'), 'hello');
  assert.equal(fs.readdirSync(dir).some((n) => n.includes('.tmp-')), false);
  fs.rmSync(dir, { recursive: true, force: true });
});
