import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import type { BackendMessage, WorkflowInstance } from '../WorkflowDefinition';
import {
  buildExecutionRecoveryMessages,
  findInterruptedRunningStageIndex,
} from '../WorkflowRecoveryViewModel';

function buildInstance(): WorkflowInstance {
  return {
    definition: {
      id: 'wf_recover',
      version: '2.0',
      meta: { title: 'recover', taskType: 'software', userInput: 'u', createdAt: new Date().toISOString() },
      stages: [
        {
          id: 'stage_decide_a',
          title: 'decide',
          tool: 'llm-text',
          toolConfig: { type: 'llm-text', systemPrompt: 'x' },
          input: { sources: [], mergeStrategy: 'concat' },
          outputs: [{ key: 'decisionRecord', format: 'markdown' }],
          pauseAfter: true,
          isDecisionStage: true,
          questionAfter: [{ id: 'q1', text: 'ok?', required: true }],
        },
      ],
    },
    currentStageIndex: 0,
    status: 'paused',
    stageRuntimes: [
      {
        stageId: 'stage_decide_a',
        status: 'paused',
        outputs: { decisionRecord: 'record' },
        retryCount: 0,
      },
    ],
  };
}

test('buildExecutionRecoveryMessages emits instanceResumed and replay messages', () => {
  const instance = buildInstance();
  const msgs = buildExecutionRecoveryMessages(instance, 'key-1');
  assert.equal(msgs[0].type, 'instanceResumed');
  assert.equal((msgs[0] as Extract<BackendMessage, { type: 'instanceResumed' }>).instanceKey, 'key-1');
  assert.equal((msgs[0] as Extract<BackendMessage, { type: 'instanceResumed' }>).resync, true);
  assert.equal(msgs.some((m: BackendMessage) => m.type === 'stageStatusUpdate'), false);
  assert.equal(msgs.some((m: BackendMessage) => m.type === 'stageOutputUpdate'), true);
  assert.equal(msgs.some((m: BackendMessage) => m.type === 'stageQuestions'), true);
  const resumed = msgs[0] as Extract<BackendMessage, { type: 'instanceResumed' }>;
  assert.deepEqual(resumed.stageStatuses, { stage_decide_a: 'paused' });
});

test('buildExecutionRecoveryMessages does not replay stageError when stage is done', () => {
  const instance = buildInstance();
  instance.stageRuntimes[0].status = 'done';
  instance.stageRuntimes[0].lastError = {
    error: 'stale from prior failure',
    errorType: 'tool-execution-failed',
  };
  const msgs = buildExecutionRecoveryMessages(instance, 'key-1');
  assert.equal(msgs.some((m) => m.type === 'stageError'), false);
});

test('buildExecutionRecoveryMessages enriches replayed stageError with userTitle', () => {
  const instance = buildInstance();
  instance.status = 'failed';
  instance.stageRuntimes[0].status = 'error';
  instance.stageRuntimes[0].lastError = {
    error: 'boom',
    errorType: 'tool-execution-failed',
  };
  const msgs = buildExecutionRecoveryMessages(instance, 'key-1');
  const err = msgs.find((m) => m.type === 'stageError') as Extract<BackendMessage, { type: 'stageError' }> | undefined;
  assert.ok(err);
  assert.equal(typeof err!.userTitle, 'string');
  assert.ok((err!.userTitle ?? '').length > 0);
});

test('findInterruptedRunningStageIndex finds running or retrying stage', () => {
  const instance = buildInstance();
  instance.stageRuntimes.push({ stageId: 'stage_b', status: 'retrying', outputs: {}, retryCount: 0 });
  assert.equal(findInterruptedRunningStageIndex(instance), 1);
});
