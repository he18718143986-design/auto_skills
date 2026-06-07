import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import type { BackendMessage } from '../WorkflowDefinition';
import {
  acceptUiEpochFromInstanceResumed,
  getLastAcceptedUiEpoch,
  resetUiEpochState,
  shouldAcceptUiEpoch,
  UI_EPOCH_GATE_STRICT,
} from '../webview/runtime/uiEpochGate';

test('shouldAcceptUiEpoch: stale epoch after instanceResumed is rejected', () => {
  resetUiEpochState();
  acceptUiEpochFromInstanceResumed(2);
  assert.equal(getLastAcceptedUiEpoch(), 2);
  const stale: BackendMessage = {
    type: 'stageStatusUpdate',
    stageId: 's1',
    status: 'running',
    uiEpoch: 1,
  };
  assert.equal(shouldAcceptUiEpoch(stale), false);
  const live: BackendMessage = {
    type: 'stageStatusUpdate',
    stageId: 's1',
    status: 'done',
    uiEpoch: 2,
  };
  assert.equal(shouldAcceptUiEpoch(live), true);
});

test('shouldAcceptUiEpoch: missing uiEpoch allowed in permissive mode', () => {
  resetUiEpochState();
  acceptUiEpochFromInstanceResumed(1);
  assert.equal(UI_EPOCH_GATE_STRICT, false);
  const legacy: BackendMessage = {
    type: 'stageStatusUpdate',
    stageId: 's1',
    status: 'running',
  };
  assert.equal(shouldAcceptUiEpoch(legacy), true);
});

test('shouldAcceptUiEpoch: instanceResumed always accepted regardless of epoch', () => {
  resetUiEpochState();
  acceptUiEpochFromInstanceResumed(5);
  const resumed: BackendMessage = {
    type: 'instanceResumed',
    instanceKey: 'k1',
    workflow: { id: 'wf', version: '2.0', meta: {}, stages: [] } as never,
    instanceStatus: 'paused',
    uiEpoch: 1,
  };
  assert.equal(shouldAcceptUiEpoch(resumed), true);
});
