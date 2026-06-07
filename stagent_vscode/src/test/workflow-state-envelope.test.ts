import assert from 'node:assert';
import test from 'node:test';
import type { WorkflowInstance } from '../WorkflowDefinition';
import {
  computeInstanceContentHash,
  serializeInstanceForDisk,
  unwrapInstanceFromDisk,
  WF_STATE_SCHEMA_VERSION,
} from '../WorkflowStateEnvelope';

function minimalInstance(): WorkflowInstance {
  return {
    definition: {
      id: 'wf_test',
      version: '2.0',
      meta: { title: 't', taskType: 'software', userInput: 'u', createdAt: '2020-01-01' },
      stages: [{ id: 's1', title: 'S', tool: 'llm-text', toolConfig: { type: 'llm-text', systemPrompt: 'x' }, input: { sources: [], mergeStrategy: 'concat' }, outputs: [], pauseAfter: false }],
    },
    currentStageIndex: 0,
    stageRuntimes: [{ stageId: 's1', status: 'pending', outputs: {}, retryCount: 0 }],
    status: 'idle',
  };
}

test('serialize and unwrap preserve lastFailureSnapshot', () => {
  const inst = minimalInstance();
  inst.stageRuntimes[0]!.lastFailureSnapshot = {
    capturedAt: '2026-06-01T00:00:00.000Z',
    errorType: 'tool-execution-failed',
    stderr: 'persisted stderr',
    outputs: { _exitCode: 1 },
  };
  const json = serializeInstanceForDisk(inst);
  const back = unwrapInstanceFromDisk(JSON.parse(json));
  assert.equal(back?.stageRuntimes[0]?.lastFailureSnapshot?.stderr, 'persisted stderr');
  assert.equal(back?.stageRuntimes[0]?.lastFailureSnapshot?.outputs?._exitCode, 1);
});

test('wrap and unwrap v1 envelope', () => {
  const inst = minimalInstance();
  const json = serializeInstanceForDisk(inst);
  const parsed = JSON.parse(json) as { schemaVersion: number; contentHash?: string };
  assert.equal(parsed.schemaVersion, WF_STATE_SCHEMA_VERSION);
  assert.ok(parsed.contentHash);
  const back = unwrapInstanceFromDisk(JSON.parse(json));
  assert.equal(back?.definition.id, 'wf_test');
});

test('unwrap v0 bare instance', () => {
  const inst = minimalInstance();
  const back = unwrapInstanceFromDisk(inst);
  assert.equal(back?.status, 'idle');
});

test('content hash mismatch warns', () => {
  const inst = minimalInstance();
  const warnings: string[] = [];
  const env = JSON.parse(serializeInstanceForDisk(inst)) as Record<string, unknown>;
  env.contentHash = 'deadbeef00000000';
  unwrapInstanceFromDisk(env, (m) => warnings.push(m));
  assert.ok(warnings.some((w) => w.includes('state_content_hash_mismatch')));
});
