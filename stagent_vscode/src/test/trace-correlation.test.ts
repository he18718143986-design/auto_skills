import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { formatSessionLogLine, appendSessionLogLine } from '../SessionDebugLog';
import { SESSION_DEBUG_FILENAME } from '../paths/StagentPaths';
import { withCorrelationFields } from '../InstanceSession';
import { WorkflowEngineDiagnostics } from '../WorkflowEngineDiagnostics';
import { SESSION_LOG_EVENT_DEGRADED } from '../SessionLogEvents';
import { DEBUG_EVENT_DEGRADED } from '../DebugLogEvents';
import { WORKFLOW_LEVEL_STAGE_ID } from '../workflow/WorkflowLevelIds';

test('formatSessionLogLine embeds traceId for grep join', () => {
  const line = formatSessionLogLine('llm', 'llm_start', { model: 'x' }, 'trace_abc');
  assert.ok(line.includes('[trace:trace_abc]'));
  assert.ok(line.includes('[llm]'));
});

test('withCorrelationFields merges session and trace', () => {
  assert.deepEqual(withCorrelationFields('key-1', 'trace_abc'), {
    instanceKey: 'key-1',
    sessionId: 'key-1',
    traceId: 'trace_abc',
  });
});

test('diagnostics.degraded writes per-task debug log with traceId', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stagent-trace-'));
  const taskDir = path.join(tmp, 'task-1');
  fs.mkdirSync(taskDir, { recursive: true });
  const diag = new WorkflowEngineDiagnostics({
    getActiveInstanceKey: () => 'task-1',
    getTraceId: () => 'trace_join_test',
    ensureTaskDir: () => taskDir,
    getOrCreateOutputChannel: () => ({ appendLine: () => {} }) as never,
    getGlobalStoragePath: () => tmp,
  });
  diag.degraded('test_degraded_reason', { site: 'unit-test' });
  const wfDebug = fs.readFileSync(path.join(taskDir, '.wf-debug.log'), 'utf-8');
  assert.ok(wfDebug.includes('trace_join_test'));
  assert.ok(wfDebug.includes(DEBUG_EVENT_DEGRADED));
  assert.ok(wfDebug.includes(WORKFLOW_LEVEL_STAGE_ID));
});

test('session log line format includes trace prefix when provided', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stagent-sess-'));
  const line = formatSessionLogLine('diagnostics', SESSION_LOG_EVENT_DEGRADED, { reason: 'x' }, 'trace_sess');
  appendSessionLogLine(tmp, line);
  const content = fs.readFileSync(path.join(tmp, SESSION_DEBUG_FILENAME), 'utf-8');
  assert.ok(content.includes('[trace:trace_sess]'));
});
