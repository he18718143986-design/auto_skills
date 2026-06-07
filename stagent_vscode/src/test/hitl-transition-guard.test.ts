import './install-vscode-stub';
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import type { StageRuntime, WorkflowInstance } from '../WorkflowDefinition';
import { applyQuestionAfterAnswers } from '../QuestionAfterFlow';
import { notifyStageStatus } from '../stage-runners/post-run/notifyStageStatus';
import { handleQuestionBeforeGate } from '../WorkflowStageQuestionGate';
import {
  guardedInstanceTransition,
  guardedStageTransition,
  isAllowedInstanceTransition,
  isAllowedStageTransition,
  setTransitionLogger,
  type TransitionGuardEntry,
} from '../WorkflowStateTransitions';
import type { ExecuteNextStageLoopParams } from '../WorkflowExecutorTypes';

function captureTransitions(): { entries: TransitionGuardEntry[]; restore: () => void } {
  const entries: TransitionGuardEntry[] = [];
  setTransitionLogger((e) => entries.push(e));
  return {
    entries,
    restore: () => setTransitionLogger(() => {}),
  };
}

function makeStage(id: string, questionBefore?: { id: string; text: string; required: boolean }[]) {
  return {
    id,
    title: id,
    tool: 'llm-text' as const,
    toolConfig: { type: 'llm-text' as const, systemPrompt: 'x' },
    input: { sources: [], mergeStrategy: 'concat' as const },
    outputs: [{ key: 'out', format: 'text' as const }],
    pauseAfter: false,
    questionBefore,
  };
}

test('guardedStageTransition logs legal pause and done edges', () => {
  const { entries, restore } = captureTransitions();
  try {
    const rt: StageRuntime = { stageId: 's1', status: 'running', outputs: {}, retryCount: 0 };
    guardedStageTransition(rt, 'paused', 'test-pause');
    assert.equal(rt.status, 'paused');
    assert.equal(entries.length, 1);
    assert.equal(entries[0]!.legal, true);
    assert.equal(entries[0]!.reason, 'test-pause');

    guardedStageTransition(rt, 'done', 'test-done');
    assert.equal(rt.status, 'done');
    assert.equal(entries[1]!.legal, true);
  } finally {
    restore();
  }
});

test('guardedStageTransition logs illegal edges without blocking write', () => {
  const { entries, restore } = captureTransitions();
  try {
    const rt: StageRuntime = { stageId: 's1', status: 'pending', outputs: {}, retryCount: 0 };
    guardedStageTransition(rt, 'paused', 'illegal-test');
    assert.equal(rt.status, 'paused');
    assert.equal(entries[0]!.legal, false);
  } finally {
    restore();
  }
});

test('guardedInstanceTransition allows completed→running for decision retry resume', () => {
  const { entries, restore } = captureTransitions();
  try {
    const instance: WorkflowInstance = {
      definition: {
        id: 'wf',
        version: '2.0',
        meta: { title: 't', taskType: 'software', userInput: '', createdAt: '' },
        stages: [],
      },
      currentStageIndex: 0,
      stageRuntimes: [],
      status: 'completed',
    };
    guardedInstanceTransition(instance, 'running', 'hitl-retry-resume-from-completed');
    assert.equal(instance.status, 'running');
    assert.equal(entries[0]!.legal, true);
    assert.ok(isAllowedInstanceTransition('completed', 'running'));
  } finally {
    restore();
  }
});

test('notifyStageStatus routes pause entry through guarded transition', () => {
  const { entries, restore } = captureTransitions();
  try {
    const stage = makeStage('stage_a');
    const runtime: StageRuntime = { stageId: stage.id, status: 'running', outputs: { out: 'x' }, retryCount: 0 };
    const params = {
      postMessage: () => {},
      panel: {},
      scheduleSave: () => {},
      debugLog: () => {},
    } as unknown as ExecuteNextStageLoopParams;
    notifyStageStatus({ params, stage, runtime, outKey: 'out', attempt: 1, shouldPause: true });
    assert.equal(runtime.status, 'paused');
    assert.ok(entries.some((e) => e.reason === 'stage-pause-after' && e.to === 'paused'));
  } finally {
    restore();
  }
});

test('handleQuestionBeforeGate routes waiting-questions through guarded transition', async () => {
  const { entries, restore } = captureTransitions();
  try {
    const stage = makeStage('stage_q', [{ id: 'q1', text: 'Q?', required: true }]);
    const runtime: StageRuntime = { stageId: stage.id, status: 'pending', outputs: {}, retryCount: 0 };
    const params = { isAdaptiveGrillForStage: () => false } as unknown as ExecuteNextStageLoopParams;
    const outcome = await handleQuestionBeforeGate(
      params,
      stage,
      runtime,
      {},
      () => {},
      () => {},
    );
    assert.equal(outcome, 'halt');
    assert.equal(runtime.status, 'waiting-questions');
    assert.ok(entries.some((e) => e.reason === 'question-before-batch' && e.to === 'waiting-questions'));
  } finally {
    restore();
  }
});

test('applyQuestionAfterAnswers routes paused→done through guarded transition', () => {
  const { entries, restore } = captureTransitions();
  try {
    const runtime: StageRuntime = { stageId: 's1', status: 'paused', outputs: {}, retryCount: 0 };
    applyQuestionAfterAnswers(runtime, { q1: 'a' }, '2026-06-06T00:00:00.000Z');
    assert.equal(runtime.status, 'done');
    assert.ok(entries.some((e) => e.reason === 'question-after-answers' && e.from === 'paused'));
  } finally {
    restore();
  }
});

test('isAllowedStageTransition documents key HITL edges', () => {
  assert.equal(isAllowedStageTransition('running', 'paused'), true);
  assert.equal(isAllowedStageTransition('running', 'waiting-questions'), true);
  assert.equal(isAllowedStageTransition('waiting-questions', 'pending'), true);
  assert.equal(isAllowedStageTransition('paused', 'done'), true);
  assert.equal(isAllowedStageTransition('pending', 'paused'), false);
});
