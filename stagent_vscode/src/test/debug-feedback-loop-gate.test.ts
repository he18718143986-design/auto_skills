import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateDebugFeedbackLoopGate,
  hasCompletedFeedbackLoopBefore,
  isDebugHypothesisOrFixStage,
} from '../DebugFeedbackLoopGate';
import type { WorkflowDefinition, StageRuntime } from '../WorkflowDefinition';

function rt(status: StageRuntime['status']): StageRuntime {
  return { stageId: 'x', status, outputs: {}, retryCount: 0 };
}

test('isDebugHypothesisOrFixStage detects hypothesis id', () => {
  assert.equal(
    isDebugHypothesisOrFixStage({ id: 'stage_hypothesis_debug_root_cause', title: 'h' } as never),
    true,
  );
});

test('hasCompletedFeedbackLoopBefore when reproduce done', () => {
  const wf: WorkflowDefinition = {
    id: 'w',
    version: '2.0',
    meta: { title: 't', taskType: 'debug', userInput: 'u', createdAt: '2020-01-01T00:00:00Z' },
    stages: [
      {
        id: 'stage_reproduce_debug_case',
        title: 'rep',
        tool: 'code-runner',
        toolConfig: { type: 'code-runner', command: 'npm test', captureOutput: true },
        input: { sources: [], mergeStrategy: 'concat' },
        outputs: [],
        pauseAfter: false,
      },
      {
        id: 'stage_hypothesis_debug_root_cause',
        title: 'hyp',
        tool: 'llm-text',
        toolConfig: { type: 'llm-text', systemPrompt: 'h' },
        input: { sources: [], mergeStrategy: 'concat' },
        outputs: [],
        pauseAfter: true,
      },
    ],
  };
  const runtimes = [rt('done'), rt('pending')];
  assert.equal(hasCompletedFeedbackLoopBefore(wf, runtimes, 1), true);
});

test('evaluateDebugFeedbackLoopGate blocks hypothesis without feedback', () => {
  const wf: WorkflowDefinition = {
    id: 'w',
    version: '2.0',
    meta: { title: 't', taskType: 'debug', userInput: 'u', createdAt: '2020-01-01T00:00:00Z' },
    stages: [
      {
        id: 'stage_hypothesis_debug_root_cause',
        title: 'hyp',
        tool: 'llm-text',
        toolConfig: { type: 'llm-text', systemPrompt: 'h' },
        input: { sources: [], mergeStrategy: 'concat' },
        outputs: [],
        pauseAfter: true,
      },
    ],
  };
  const ev = evaluateDebugFeedbackLoopGate({
    workflow: wf,
    stage: wf.stages[0],
    stageIndex: 0,
    stageRuntimes: [rt('pending')],
    requireHard: true,
  });
  assert.equal(ev?.outcome, 'block');
});
