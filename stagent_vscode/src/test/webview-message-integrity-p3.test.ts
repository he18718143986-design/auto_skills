/**
 * P3 验收：handler 审计表（源码断言）+ 三层 defense-in-depth 集成场景。
 */
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { BackendMessage } from '../WorkflowDefinition';
import { shouldAcceptBackendMessage } from '../webview/runtime/backendMessageInstanceGate';
import { applySessionFromBackend } from '../webview/runtime/session';
import {
  applyStageStatusSnapshot,
  getLastAppliedBackendSeq,
  getStageStatus,
  patchStageStatus,
  resetStageStatusSeqState,
  tryAdvanceBackendSeq,
} from '../webview/runtime/stageStatusStore';
import { recordStageQuestionsSeq, shouldApplyStageQuestions } from '../webview/runtime/stageQuestionsSeqGate';
import { execStore, resetExecStore, sessionStore } from '../webview/runtime/stores';

const SRC = path.resolve(__dirname, '..', '..', 'src');
const HANDLERS = path.join(SRC, 'webview', 'runtime', 'backend-handlers');

function readSrc(relFromSrc: string): string {
  return fs.readFileSync(path.join(SRC, relFromSrc), 'utf8');
}

type AuditRow = {
  name: string;
  handlerFile: string;
  seqPattern: RegExp;
};

const EXEC_HANDLER_AUDIT: AuditRow[] = [
  {
    name: 'stageStatusUpdate',
    handlerFile: 'execution-ui.ts',
    seqPattern: /patchStageStatus\([\s\S]*?msg\.seq/,
  },
  {
    name: 'dagWaveUpdate',
    handlerFile: 'execution-ui.ts',
    seqPattern: /function handleDagWaveUpdate[\s\S]*?tryAdvanceBackendSeq\(msg\.seq\)/,
  },
  {
    name: 'llmUsageUpdate',
    handlerFile: 'execution-ui.ts',
    seqPattern: /function handleLlmUsageUpdate[\s\S]*?tryAdvanceBackendSeq\(msg\.seq\)/,
  },
  {
    name: 'streamChunk (exec)',
    handlerFile: 'execution-ui.ts',
    seqPattern: /function handleExecStreamChunk[\s\S]*?tryAdvanceBackendSeq\(msg\.seq\)/,
  },
  {
    name: 'stageOutputUpdate',
    handlerFile: 'execution-ui.ts',
    seqPattern: /function handleStageOutputUpdate[\s\S]*?tryAdvanceBackendSeq\(msg\.seq\)/,
  },
  {
    name: 'stageError',
    handlerFile: 'artifacts-errors.ts',
    seqPattern: /patchStageStatus\(msg\.stageId, 'error', msg\.seq\)/,
  },
  {
    name: 'workflowFailed',
    handlerFile: 'artifacts-errors.ts',
    seqPattern: /patchStageStatus\(msg\.stageId, 'error', msg\.seq\)/,
  },
  {
    name: 'workflowCompleted',
    handlerFile: 'artifacts-errors.ts',
    seqPattern: /function handleWorkflowCompleted[\s\S]*?tryAdvanceBackendSeq\(msg\.seq\)/,
  },
  {
    name: 'stageConfidenceUpdate',
    handlerFile: 'hitl-ui.ts',
    seqPattern: /function handleStageConfidenceUpdate[\s\S]*?tryAdvanceBackendSeq\(msg\.seq\)/,
  },
  {
    name: 'stageArtifactHints',
    handlerFile: 'hitl-ui.ts',
    seqPattern: /function handleStageArtifactHints[\s\S]*?tryAdvanceBackendSeq\(msg\.seq\)/,
  },
  {
    name: 'downstreamReset',
    handlerFile: 'hitl-ui.ts',
    seqPattern: /resetStagesToPending\(resetIds, msg\.seq\)/,
  },
  {
    name: 'stageQuestions',
    handlerFile: 'hitl-ui.ts',
    seqPattern: /shouldApplyStageQuestions\(msg\.stageId, 'after', msg\.seq/,
  },
  {
    name: 'stageQuestionsBefore',
    handlerFile: 'hitl-ui.ts',
    seqPattern: /shouldApplyStageQuestions\(msg\.stageId, 'before', msg\.seq/,
  },
  {
    name: 'instanceResumed snapshot',
    handlerFile: 'instance-sync.ts',
    seqPattern: /applyStageStatusSnapshot\(msg\.stageStatuses, msg\.seq\)/,
  },
];

for (const row of EXEC_HANDLER_AUDIT) {
  test(`P3 audit checklist: ${row.name} wired to seq gate`, () => {
    const src = fs.readFileSync(path.join(HANDLERS, row.handlerFile), 'utf8');
    assert.match(src, row.seqPattern, `${row.name} missing expected seq gate in ${row.handlerFile}`);
  });
}

const UI_REFRESH_AUDIT: Array<{ name: string; handlerFile: string; refreshPattern: RegExp }> = [
  {
    name: 'stageStatusUpdate',
    handlerFile: 'execution-ui.ts',
    refreshPattern: /function handleStageStatusUpdate[\s\S]*'timeline'[\s\S]*scheduleUiRefresh/,
  },
  {
    name: 'stageConfidenceUpdate',
    handlerFile: 'hitl-ui.ts',
    refreshPattern: /scheduleUiRefresh\(\['timeline'\]\)/,
  },
  {
    name: 'downstreamReset',
    handlerFile: 'hitl-ui.ts',
    refreshPattern: /scheduleUiRefresh\(\['timeline'\]\)/,
  },
  {
    name: 'workflowCompleted',
    handlerFile: 'artifacts-errors.ts',
    refreshPattern: /scheduleUiRefresh\([\s\S]*?'timeline'/,
  },
  {
    name: 'instanceResumed',
    handlerFile: 'instance-sync.ts',
    refreshPattern: /scheduleUiRefresh\(\['timeline'\]\)/,
  },
];

for (const row of UI_REFRESH_AUDIT) {
  test(`P3 audit checklist: ${row.name} schedules UI refresh`, () => {
    const src = fs.readFileSync(path.join(HANDLERS, row.handlerFile), 'utf8');
    assert.match(src, row.refreshPattern, `${row.name} missing scheduleUiRefresh in ${row.handlerFile}`);
  });
}

test('P3 audit checklist: dispatch entry uses instanceKey gate', () => {
  assert.match(readSrc('webview/runtime/messages.ts'), /shouldAcceptBackendMessage/);
  assert.match(readSrc('webview/runtime/messages.ts'), /shouldAcceptUiEpoch/);
});

test('P3 audit checklist: Bridge injects uiEpoch', () => {
  assert.match(readSrc('WorkflowUiBridge.ts'), /uiEpoch/);
  assert.match(readSrc('BackendMessageEnrichment.ts'), /uiEpoch/);
});

test('P3 audit checklist: Bridge injects instanceKey', () => {
  assert.match(readSrc('WorkflowUiBridge.ts'), /enrichBackendMessageForWebview/);
  assert.match(readSrc('BackendMessageEnrichment.ts'), /enrichBackendMessageInstanceKey/);
});

function setActive(key: string | null): void {
  sessionStore.sessionId = key;
  sessionStore.activeInstanceKey = key;
  sessionStore.draftInstanceKey = key;
}

test('P3 integration: old instance high seq blocked by instanceKey only', () => {
  resetExecStore();
  resetStageStatusSeqState();
  setActive('inst-new');
  applyStageStatusSnapshot({ stage_impl: 'running' }, 50);

  const late: BackendMessage = {
    type: 'stageOutputUpdate',
    stageId: 'stage_impl',
    outputKey: 'main',
    content: 'stale-from-old-instance',
    seq: 9999,
    instanceKey: 'inst-old',
  };

  assert.equal(shouldAcceptBackendMessage(late), false);
  assert.equal(tryAdvanceBackendSeq(9999), true, 'seq gate alone would incorrectly accept high seq');
  assert.equal(execStore.stageMaps.stageOutputs.stage_impl, undefined);
});

test('P3 integration: same instance stale replay blocked by seq gate after snapshot', () => {
  resetExecStore();
  resetStageStatusSeqState();
  setActive('inst-a');
  applyStageStatusSnapshot({ stage_impl: 'done' }, 100);

  const replay: BackendMessage = {
    type: 'stageStatusUpdate',
    stageId: 'stage_impl',
    status: 'running',
    seq: 50,
    instanceKey: 'inst-a',
  };

  assert.equal(shouldAcceptBackendMessage(replay), true, 'instanceKey matches active session');
  const applied = patchStageStatus(replay.stageId, replay.status, replay.seq);
  assert.equal(applied.applied, false, 'seq gate rejects stale replay');
  assert.equal(getStageStatus('stage_impl'), 'done');
});

test('P3 integration: instanceResumed replay stageStatusUpdate with seq below snapshot rejected', () => {
  resetExecStore();
  resetStageStatusSeqState();
  setActive('inst-resumed');
  applyStageStatusSnapshot({ stage_a: 'done', stage_b: 'running' }, 100);

  const replayStatus = patchStageStatus('stage_b', 'error', 99);
  assert.equal(replayStatus.applied, false);
  assert.equal(getStageStatus('stage_b'), 'running');
});

test('P3 integration: instance switch binds session then drops old instance traffic', () => {
  resetExecStore();
  resetStageStatusSeqState();
  setActive('inst-old');
  patchStageStatus('stage_x', 'running', 40);

  applySessionFromBackend({ instanceKey: 'inst-new', sessionId: 'inst-new' });
  applyStageStatusSnapshot({ stage_y: 'running' }, 60);

  assert.equal(
    shouldAcceptBackendMessage({
      type: 'streamChunk',
      stageId: 'stage_x',
      chunk: 'old',
      seq: 9999,
      instanceKey: 'inst-old',
    }),
    false,
  );
  assert.equal(
    shouldAcceptBackendMessage({
      type: 'stageStatusUpdate',
      stageId: 'stage_y',
      status: 'running',
      seq: 61,
      instanceKey: 'inst-new',
    }),
    true,
  );
});

test('P3 integration: stageQuestions before paused — gate + buffer not killed by stale replay', () => {
  resetExecStore();
  resetStageStatusSeqState();
  setActive('inst-q');

  assert.equal(
    shouldAcceptBackendMessage({
      type: 'stageQuestions',
      stageId: 'stage_impl',
      questions: [{ id: 'q1', text: 'Why?' }],
      seq: 8,
      instanceKey: 'inst-q',
    }),
    true,
  );
  assert.equal(shouldApplyStageQuestions('stage_impl', 'after', 8, getLastAppliedBackendSeq()), true);
  recordStageQuestionsSeq('stage_impl', 'after', 8);
  execStore.stageMaps.afterQuestionsByStage.stage_impl = [{ id: 'q1', text: 'Why?' }];

  assert.equal(
    shouldAcceptBackendMessage({
      type: 'stageStatusUpdate',
      stageId: 'stage_impl',
      status: 'paused',
      seq: 9,
      instanceKey: 'inst-q',
    }),
    true,
  );
  assert.equal(patchStageStatus('stage_impl', 'paused', 9).applied, true);
  assert.deepEqual(execStore.stageMaps.afterQuestionsByStage.stage_impl, [{ id: 'q1', text: 'Why?' }]);

  assert.equal(shouldApplyStageQuestions('stage_impl', 'after', 7, getLastAppliedBackendSeq()), false);
  assert.deepEqual(execStore.stageMaps.afterQuestionsByStage.stage_impl, [{ id: 'q1', text: 'Why?' }]);
});

test('P3 integration: stageQuestions gate allows before-status without blocking status seq', () => {
  resetExecStore();
  resetStageStatusSeqState();
  assert.equal(shouldApplyStageQuestions('stage_impl', 'after', 8, getLastAppliedBackendSeq()), true);
  recordStageQuestionsSeq('stage_impl', 'after', 8);
  execStore.stageMaps.afterQuestionsByStage.stage_impl = [{ id: 'q1', text: '?' }];
  assert.equal(patchStageStatus('stage_impl', 'paused', 9).applied, true);
  assert.deepEqual(execStore.stageMaps.afterQuestionsByStage.stage_impl, [{ id: 'q1', text: '?' }]);
});
