import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assessWriteOutputIntegrity,
  WriteOutputIntegrityMismatchError,
} from '../stage-runners/llm-persist/writeOutputIntegrityAssess';

test('assessWriteOutputIntegrity: ok when raw is small', () => {
  assert.equal(assessWriteOutputIntegrity(100, 80), 'ok');
});

test('assessWriteOutputIntegrity: ok when ratio is healthy', () => {
  assert.equal(assessWriteOutputIntegrity(10000, 9000), 'ok');
});

test('assessWriteOutputIntegrity: mismatch on severe truncation', () => {
  assert.equal(assessWriteOutputIntegrity(29000, 96), 'mismatch');
  assert.equal(assessWriteOutputIntegrity(5000, 500), 'mismatch');
});

test('assessWriteOutputIntegrity: mismatch on tiny write with large raw', () => {
  assert.equal(assessWriteOutputIntegrity(3000, 100), 'mismatch');
});

test('WriteOutputIntegrityMismatchError carries char counts', () => {
  const e = new WriteOutputIntegrityMismatchError(1000, 50, 'server/a.ts');
  assert.equal(e.rawChars, 1000);
  assert.equal(e.writtenChars, 50);
  assert.equal(e.relPath, 'server/a.ts');
});
