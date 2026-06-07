import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  SESSION_DEBUG_FILENAME,
  sessionDebugLogPath,
  formatSessionLogLine,
  appendSessionLogLine,
} from '../SessionDebugLog';
import { TRACE_STAGE_CLARIFY_QUESTIONS } from '../generation/GenerationTraceStageIds';

test('sessionDebugLogPath joins the fixed filename under the storage dir', () => {
  assert.equal(sessionDebugLogPath('/tmp/store'), path.join('/tmp/store', SESSION_DEBUG_FILENAME));
  assert.equal(SESSION_DEBUG_FILENAME, '.session-debug.log');
});

test('formatSessionLogLine encodes ISO ts + session/purpose/event + json payload', () => {
  const line = formatSessionLogLine('task-polish', 'llm_start', { model: 'direct:gpt-4o', promptChars: 12 });
  assert.match(line, /^\d{4}-\d{2}-\d{2}T[\d:.]+Z \[session\] \[task-polish\] \[llm_start\] /);
  assert.match(line, /"model":"direct:gpt-4o"/);
  assert.match(line, /"promptChars":12/);
});

test('formatSessionLogLine omits payload when undefined', () => {
  const line = formatSessionLogLine(TRACE_STAGE_CLARIFY_QUESTIONS, 'llm_end');
  assert.match(line, /\[clarify-questions\] \[llm_end\] $/);
});

test('formatSessionLogLine redacts sensitive fields (sanitizeForLog)', () => {
  const line = formatSessionLogLine('workflow-gen', 'llm_start', { apiKey: 'sk-secret', model: 'm' });
  assert.match(line, /"apiKey":"\[REDACTED\]"/);
  assert.doesNotMatch(line, /sk-secret/);
});

test('appendSessionLogLine creates the dir and appends lines in order', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-log-'));
  const sub = path.join(dir, 'nested-storage'); // not yet created → must be made
  try {
    appendSessionLogLine(sub, formatSessionLogLine('task-polish', 'llm_start', { a: 1 }));
    appendSessionLogLine(sub, formatSessionLogLine('task-polish', 'llm_end', { b: 2 }));

    const raw = fs.readFileSync(sessionDebugLogPath(sub), 'utf-8');
    const lines = raw.trimEnd().split('\n');
    assert.equal(lines.length, 2);
    assert.match(lines[0], /\[llm_start\] .*"a":1/);
    assert.match(lines[1], /\[llm_end\] .*"b":2/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function rotationTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'stagent-sesslog-rot-'));
}

test('#15 rotates to a single .1 backup when exceeding maxBytes', () => {
  const dir = rotationTmpDir();
  const filePath = sessionDebugLogPath(dir);
  const rotated = `${filePath}.1`;
  const maxBytes = 55; // 'A'*50 + '\n' = 51 字节；再写 'BBBB\n'(5) → 56 > 55 触发轮换

  appendSessionLogLine(dir, 'A'.repeat(50), maxBytes);
  assert.ok(fs.existsSync(filePath));
  assert.ok(!fs.existsSync(rotated), '尚未超限不应轮换');

  // 「现有 + 本行」超过上限 → 轮换：旧内容进 .1，主文件仅含新行。
  appendSessionLogLine(dir, 'BBBB', maxBytes);
  assert.ok(fs.existsSync(rotated), '超限后应生成 .1 备份');
  assert.equal(fs.readFileSync(rotated, 'utf-8'), `${'A'.repeat(50)}\n`);
  assert.equal(fs.readFileSync(filePath, 'utf-8'), 'BBBB\n');
});

test('#15 keeps only one backup (second rotation overwrites .1)', () => {
  const dir = rotationTmpDir();
  const filePath = sessionDebugLogPath(dir);
  const rotated = `${filePath}.1`;
  const maxBytes = 32;

  appendSessionLogLine(dir, 'first-batch-XXXXXXXXXXXXXXX', maxBytes);
  appendSessionLogLine(dir, 'second', maxBytes); // 第一次轮换：.1 = first-batch...
  appendSessionLogLine(dir, 'second-batch-YYYYYYYYYYYYYYY', maxBytes);
  appendSessionLogLine(dir, 'third', maxBytes); // 第二次轮换：.1 被覆盖为 second-batch...

  assert.ok(fs.existsSync(rotated));
  assert.ok(fs.readFileSync(rotated, 'utf-8').startsWith('second-batch'));
  assert.equal(fs.readFileSync(filePath, 'utf-8'), 'third\n');
});

test('#15 default maxBytes does not rotate for small writes', () => {
  const dir = rotationTmpDir();
  const filePath = sessionDebugLogPath(dir);
  appendSessionLogLine(dir, 'small line');
  appendSessionLogLine(dir, 'another small line');
  assert.ok(!fs.existsSync(`${filePath}.1`), '小量写入不应触发默认 5MB 轮换');
  assert.equal(fs.readFileSync(filePath, 'utf-8'), 'small line\nanother small line\n');
});
