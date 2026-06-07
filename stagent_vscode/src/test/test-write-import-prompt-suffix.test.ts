import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import type { Stage, WorkflowDefinition } from '../WorkflowDefinition';
import {
  buildTestWriteImportPromptSuffix,
  collectPlannedImportEntriesForTestWrite,
  relativeImportSpecFromTestFile,
} from '../stage-runners/llm-persist/testWriteImportPromptSuffix';

function stage(
  id: string,
  file: string,
  prompt = 'x',
): Stage {
  return {
    id,
    title: id,
    tool: 'llm-text',
    toolConfig: { type: 'llm-text', systemPrompt: prompt, writeOutputToFile: file },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'out', format: 'text' }],
    pauseAfter: false,
  };
}

function wf(stages: Stage[]): WorkflowDefinition {
  return {
    id: 'wf',
    version: '2.0',
    meta: { title: 't', taskType: 'software', userInput: 'x', createdAt: '2026-01-01T00:00:00.000Z' },
    stages,
  };
}

test('relativeImportSpecFromTestFile: server __tests__ → src/index', () => {
  assert.equal(
    relativeImportSpecFromTestFile(
      'server/__tests__/chat_integration.test.ts',
      'server/src/index.ts',
    ),
    '../src/index',
  );
});

test('collectPlannedImportEntriesForTestWrite filters same stack impl only', () => {
  const testWrite = stage('stage_test_write_chat', 'server/__tests__/chat.test.ts');
  const workflow = wf([
    stage('stage_impl_server_entry', 'server/src/index.ts'),
    stage('stage_impl_websocket', 'server/src/websocket.ts'),
    stage('stage_impl_flutter_main', 'mobile/lib/main.dart'),
    stage('stage_impl_jest_config', 'server/jest.config.js'),
    testWrite,
  ]);
  const entries = collectPlannedImportEntriesForTestWrite(workflow, testWrite);
  assert.deepEqual(
    entries.map((e) => e.artifactPath),
    ['server/src/index.ts', 'server/src/websocket.ts'],
  );
  assert.equal(entries[0]!.relativeImport, '../src/index');
});

test('buildTestWriteImportPromptSuffix lists allowed imports and forbids unlisted paths', () => {
  const testWrite = stage('stage_test_write_chat', 'server/__tests__/chat.test.ts');
  const suffix = buildTestWriteImportPromptSuffix(
    wf([
      stage('stage_impl_server_entry', 'server/src/index.ts'),
      testWrite,
    ]),
    testWrite,
  );
  assert.ok(suffix?.includes("from '../src/index'"));
  assert.ok(suffix?.includes('server/src/index.ts'));
  assert.ok(suffix?.includes('禁止'));
  assert.ok(suffix?.includes('../src/app'));
});

test('buildTestWriteImportPromptSuffix returns empty-stack guidance when no impl in stack', () => {
  const testWrite = stage('stage_test_write_chat', 'server/__tests__/chat.test.ts');
  const suffix = buildTestWriteImportPromptSuffix(wf([testWrite]), testWrite);
  assert.ok(suffix?.includes('无 impl 源码落盘'));
});
