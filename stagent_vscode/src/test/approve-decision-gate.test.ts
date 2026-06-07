import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { describeApproveDecisionRejection } from '../ApproveDecisionGate';

test('approveDecision gate: missing instance', () => {
  const reason = describeApproveDecisionRejection({
    hasInstance: false,
    stageFound: true,
    stageIndex: 1,
    currentStageIndex: 1,
    isDecisionStage: true,
    status: 'paused',
  });
  assert.match(reason ?? '', /未绑定任务实例/);
});

test('approveDecision gate: paused decision stage allows approve', () => {
  const reason = describeApproveDecisionRejection({
    hasInstance: true,
    stageFound: true,
    stageIndex: 1,
    currentStageIndex: 1,
    isDecisionStage: true,
    status: 'paused',
  });
  assert.equal(reason, null);
});

test('approveDecision gate: running stage rejects with wait message', () => {
  const reason = describeApproveDecisionRejection({
    hasInstance: true,
    stageFound: true,
    stageIndex: 1,
    currentStageIndex: 1,
    isDecisionStage: true,
    status: 'running',
  });
  assert.match(reason ?? '', /仍在生成中/);
});

test('approveDecision gate: stage index mismatch', () => {
  const reason = describeApproveDecisionRejection({
    hasInstance: true,
    stageFound: true,
    stageIndex: 2,
    currentStageIndex: 1,
    isDecisionStage: true,
    status: 'paused',
  });
  assert.match(reason ?? '', /阶段状态已变化/);
});
