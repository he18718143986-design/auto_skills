import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import type { Stage, WorkflowDefinition } from '../WorkflowDefinition';
import { auditSelfHealGaps, injectSelfHealStages } from '../workflow-self-heal/injectSelfHealStages';

function codeRunner(id: string, command: string): Stage {
  return {
    id,
    title: id,
    tool: 'code-runner',
    toolConfig: { type: 'code-runner', command, captureOutput: true },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'verifyOut', format: 'text' }],
    pauseAfter: false,
  };
}

function llmImpl(id: string): Stage {
  return {
    id,
    title: id,
    tool: 'llm-text',
    toolConfig: { type: 'llm-text', systemPrompt: 'x' },
    input: { sources: [{ type: 'user-input' }], mergeStrategy: 'concat' },
    outputs: [{ key: 'out', format: 'text' }],
    pauseAfter: false,
  };
}

test('injectSelfHealStages: inserts verify_imports between test_write and test_run', () => {
  const wf: WorkflowDefinition = {
    id: 'wf',
    version: '2.0',
    meta: { title: 't', taskType: 'software', userInput: 'u', createdAt: new Date().toISOString() },
    stages: [
      llmImpl('stage_impl_chat_websocket_server'),
      llmImpl('stage_test_write_chat_integration'),
      codeRunner('stage_test_run_chat_integration', 'cd server && npm test -- chat_integration'),
    ],
  };
  const { workflow, insertedStageIds, violations } = injectSelfHealStages(wf);
  const ids = workflow.stages.map((s) => s.id);
  const writeIdx = ids.indexOf('stage_test_write_chat_integration');
  const importsIdx = ids.indexOf('stage_verify_imports_chat_integration');
  const runIdx = ids.indexOf('stage_test_run_chat_integration');
  assert.ok(insertedStageIds.includes('stage_verify_imports_chat_integration'));
  assert.ok(importsIdx > writeIdx);
  assert.ok(runIdx > importsIdx);
  assert.ok(violations.some((v) => v.includes('verify_imports')));
  assert.equal(auditSelfHealGaps(workflow).some((g) => g.includes('紧跟 test_write')), false);
});

test('injectSelfHealStages: moves test_write after impl when misordered', () => {
  const wf: WorkflowDefinition = {
    id: 'wf',
    version: '2.0',
    meta: { title: 't', taskType: 'software', userInput: 'u', createdAt: new Date().toISOString() },
    stages: [
      { ...llmImpl('stage_decide_chat_core'), isDecisionStage: true, pauseAfter: true },
      llmImpl('stage_test_write_chat_integration'),
      llmImpl('stage_impl_chat_websocket_server'),
      codeRunner('stage_test_run_chat_integration', 'npm test'),
    ],
  };
  const { workflow, movedStageIds } = injectSelfHealStages(wf);
  const ids = workflow.stages.map((s) => s.id);
  assert.ok(movedStageIds.includes('stage_test_write_chat_integration'));
  assert.ok(ids.indexOf('stage_impl_chat_websocket_server') < ids.indexOf('stage_test_write_chat_integration'));
});
