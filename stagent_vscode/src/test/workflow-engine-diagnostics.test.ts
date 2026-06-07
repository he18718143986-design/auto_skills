import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { after, test } from 'node:test';
import { WorkflowEngineDiagnostics } from '../WorkflowEngineDiagnostics';
import { DEBUG_EVENT_CODEBASE_SNAPSHOT, DEBUG_EVENT_STAGE_START } from '../DebugLogEvents';
import { WORKFLOW_LEVEL_STAGE_ID } from '../workflow/WorkflowLevelIds';
import { sessionDebugLogPath } from '../SessionDebugLog';
import { taskDebugLogPath } from '../paths/StagentPaths';

test('debugLog falls back to session log when no active instance key', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stagent-diag-'));
  const channelLines: string[] = [];
  const diag = new WorkflowEngineDiagnostics({
    getActiveInstanceKey: () => undefined,
    getTraceId: () => 'trace_test',
    ensureTaskDir: () => {
      throw new Error('should not ensure task dir without key');
    },
    getOrCreateOutputChannel: () =>
      ({
        appendLine: (line: string) => {
          channelLines.push(line);
        },
      }) as unknown as import('vscode').OutputChannel,
    getGlobalStoragePath: () => tmp,
  });

  diag.debugLog(WORKFLOW_LEVEL_STAGE_ID, DEBUG_EVENT_CODEBASE_SNAPSHOT, 0, { degraded: true });
  await new Promise((r) => setTimeout(r, 50));

  const logPath = sessionDebugLogPath(tmp);
  assert.ok(fs.existsSync(logPath), 'fallback 应写入 session debug log');
  const content = fs.readFileSync(logPath, 'utf8');
  assert.ok(content.includes('debug-fallback'));
  assert.ok(content.includes('codebase_snapshot'));
  assert.ok(content.includes('trace_test'));
});

test('debugLog writes to task dir when active instance key present', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stagent-diag-task-'));
  const taskDir = path.join(tmp, 'task-1');
  fs.mkdirSync(taskDir, { recursive: true });

  const diag = new WorkflowEngineDiagnostics({
    getActiveInstanceKey: () => 'inst-1',
    getTraceId: () => 'trace_inst',
    ensureTaskDir: () => taskDir,
    getOrCreateOutputChannel: () =>
      ({
        appendLine: () => {},
      }) as unknown as import('vscode').OutputChannel,
    getGlobalStoragePath: () => tmp,
  });

  diag.debugLog('stage_a', DEBUG_EVENT_STAGE_START, 1, { tool: 'llm-text' });

  const wfDebug = taskDebugLogPath(taskDir);
  assert.ok(fs.existsSync(wfDebug));
  const content = fs.readFileSync(wfDebug, 'utf8');
  assert.ok(content.includes('stage_a'));
  assert.ok(content.includes('stage_start'));
});

after(() => {
  // temp dirs cleaned by OS; no global teardown required
});
