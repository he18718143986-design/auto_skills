import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { MiniDocument } from './webview-script-test-harness';
import {
  applyStageStatusSnapshot,
  getStageStatus,
  resetStageStatusSeqState,
} from '../webview/runtime/stageStatusStore';
import { confirmStore, execStore, inputStore, resetExecStore } from '../webview/runtime/stores';
import type { ExecStageStatus } from '../webview/shared/stageStatusPolicy';

type TestGlobal = typeof globalThis & {
  acquireVsCodeApi?: () => { postMessage: () => void };
};

function stubExecDom(): MiniDocument {
  const doc = new MiniDocument();
  for (const id of ['done-banner', 'downstream-reset-panel', 'fail-banner', 'output', 'pause-bar']) {
    doc.register(doc.createElement('div'), id);
  }
  return doc;
}

test('resetInstanceScopedUiState clears prior instance confirm/input/exec state', () => {
  const g = globalThis as TestGlobal;
  const prevDoc = (g as Record<string, unknown>).document;
  const prevAcquire = g.acquireVsCodeApi;
  g.acquireVsCodeApi = () => ({ postMessage: () => {} });
  (g as Record<string, unknown>).document = stubExecDom();
  try {
    confirmStore.planSummary = { title: 'old plan' } as never;
    confirmStore.workflowWarnings = ['warn'];
    inputStore.inputBusyOp = 'gen';
    execStore.llmUsageTotalTokens = 42;
    mapsSeedStageStatus('stale_stage', 'paused');

    const { resetInstanceScopedUiState } = require('../webview/runtime/instanceScopedReset') as {
      resetInstanceScopedUiState: () => void;
    };
    resetInstanceScopedUiState();

    assert.equal(confirmStore.planSummary, null);
    assert.equal(confirmStore.workflowWarnings.length, 0);
    assert.equal(inputStore.inputBusyOp, null);
    assert.equal(execStore.llmUsageTotalTokens, 0);
    assert.equal(getStageStatus('stale_stage'), undefined);
  } finally {
    (g as Record<string, unknown>).document = prevDoc;
    g.acquireVsCodeApi = prevAcquire;
  }
});

test('applyStageStatusSnapshot restores multi-stage instance consistently', () => {
  resetExecStore();
  resetStageStatusSeqState();
  applyStageStatusSnapshot(
    {
      stage_plan: 'done',
      stage_impl: 'running',
      stage_test: 'pending',
    },
    7,
  );
  assert.equal(getStageStatus('stage_plan'), 'done');
  assert.equal(getStageStatus('stage_impl'), 'running');
  assert.equal(getStageStatus('stage_test'), 'pending');
});

function mapsSeedStageStatus(stageId: string, status: ExecStageStatus): void {
  execStore.stageMaps.stageStatus[stageId] = status;
}
