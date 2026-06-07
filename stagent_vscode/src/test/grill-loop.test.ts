import test from 'node:test';
import assert from 'node:assert/strict';
import {
  nextGrillAction,
  selectNextGrillQuestion,
  isCodeExplorableQuestion,
  buildGrillProgress,
} from '../GrillLoopPolicy';
import {
  resolveAdaptiveGrillState,
  shouldUseAdaptiveGrill,
  shouldEnterBatchWaitingQuestions,
} from '../GrillAdaptiveFlow';

test('selectNextGrillQuestion picks first missing required', () => {
  const questions = [
    { id: 'q1', text: 'A?', required: true },
    { id: 'q2', text: 'B?', required: true },
  ];
  const next = selectNextGrillQuestion(questions, { q1: 'ok' });
  assert.equal(next?.id, 'q2');
});

test('nextGrillAction done when required answered', () => {
  const action = nextGrillAction({
    questions: [{ id: 'q1', text: 'x', required: true }],
    answers: { q1: 'y' },
    round: 0,
  });
  assert.equal(action.kind, 'done');
});

test('nextGrillAction explore-code for fact questions', () => {
  const action = nextGrillAction({
    questions: [{ id: 'q1', text: '当前代码里用了哪些依赖？', required: true }],
    answers: {},
    round: 0,
  });
  assert.equal(action.kind, 'explore-code');
});

test('isCodeExplorableQuestion rejects preference questions', () => {
  assert.equal(isCodeExplorableQuestion({ text: '你更希望用 Redis 还是内存？' }), false);
});

test('buildGrillProgress counts answered', () => {
  const p = buildGrillProgress(
    [
      { id: 'a', text: '1', required: true },
      { id: 'b', text: '2', required: false },
    ],
    { a: 'x' },
  );
  assert.equal(p.answered, 1);
  assert.deepEqual(p.remainingRequiredIds, []);
});

test('resolveAdaptiveGrillState ask for preference question', () => {
  const state = resolveAdaptiveGrillState({
    questions: [{ id: 'q1', text: '你偏好哪种方案？', required: true }],
    answers: {},
    round: 0,
  });
  assert.equal(state.done, false);
  assert.equal(state.action.kind, 'ask');
});

test('shouldUseAdaptiveGrill requires flag and questions', () => {
  assert.equal(shouldUseAdaptiveGrill(false, [{ id: 'q', text: 't' }]), false);
  assert.equal(shouldUseAdaptiveGrill(true, []), false);
  assert.equal(shouldUseAdaptiveGrill(true, [{ id: 'q', text: 't' }]), true);
});

test('shouldEnterBatchWaitingQuestions when missing required', () => {
  assert.equal(
    shouldEnterBatchWaitingQuestions([{ id: 'q', text: 't', required: true }], {}),
    true,
  );
});
