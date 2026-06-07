import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { MetricsCollector } from '../MetricsCollector';
import { WorkflowEngineDiagnostics } from '../WorkflowEngineDiagnostics';

test('MetricsCollector starts empty and reports no activity', () => {
  const m = new MetricsCollector();
  assert.equal(m.hasActivity(), false);
  assert.deepEqual(m.snapshot(), {
    llmCalls: 0,
    llmRetries: 0,
    gatePass: 0,
    gateReject: 0,
    hitlRetry: 0,
    questionsAnswered: 0,
    stageErrors: 0,
    contextDegrades: 0,
  });
});

test('MetricsCollector tallies LLM calls and retries from llm_stream_summary', () => {
  const m = new MetricsCollector();
  m.recordUserAction('llm_stream_summary', { retried: false });
  m.recordUserAction('llm_stream_summary', { retried: true });
  const snap = m.snapshot();
  assert.equal(snap.llmCalls, 2);
  assert.equal(snap.llmRetries, 1);
  assert.equal(m.hasActivity(), true);
});

test('MetricsCollector classifies gate pass / reject / hitl retry / questions', () => {
  const m = new MetricsCollector();
  m.recordUserAction('approve', {});
  m.recordUserAction('approve_decision', {});
  m.recordUserAction('approve_decision_rejected', {});
  m.recordUserAction('retry_rejected', {});
  m.recordUserAction('retry', {});
  m.recordUserAction('answer_questions_before', {});
  m.recordUserAction('answer_questions_after', {});
  m.recordUserAction('stage_error', {});
  const snap = m.snapshot();
  assert.equal(snap.gatePass, 2);
  assert.equal(snap.gateReject, 2);
  assert.equal(snap.hitlRetry, 1);
  assert.equal(snap.questionsAnswered, 2);
  assert.equal(snap.stageErrors, 1);
});

test('MetricsCollector ignores unknown kinds', () => {
  const m = new MetricsCollector();
  m.recordUserAction('edit_output', { stageId: 's1' });
  m.recordUserAction('some_future_kind', {});
  assert.equal(m.hasActivity(), false);
});

function makeDiagnostics(): WorkflowEngineDiagnostics {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metrics-diag-'));
  return new WorkflowEngineDiagnostics({
    getActiveInstanceKey: () => undefined,
    getTraceId: () => 'trace-1',
    ensureTaskDir: () => dir,
    getOrCreateOutputChannel: () => ({ appendLine: () => {} }) as never,
    getGlobalStoragePath: () => dir,
  });
}

test('WorkflowEngineDiagnostics taps logUserAction into metrics and flush resets', () => {
  const d = makeDiagnostics();
  d.logUserAction('approve', { stageId: 's1' });
  d.logUserAction('llm_stream_summary', { retried: true });
  const snap = d.getMetricsSnapshot();
  assert.equal(snap.gatePass, 1);
  assert.equal(snap.llmCalls, 1);
  assert.equal(snap.llmRetries, 1);
  d.flushMetrics('completed');
  assert.deepEqual(d.getMetricsSnapshot(), {
    llmCalls: 0,
    llmRetries: 0,
    gatePass: 0,
    gateReject: 0,
    hitlRetry: 0,
    questionsAnswered: 0,
    stageErrors: 0,
    contextDegrades: 0,
  });
});

test('WorkflowEngineDiagnostics flush is a no-op when there is no activity', () => {
  const d = makeDiagnostics();
  d.flushMetrics('completed');
  assert.equal(d.getMetricsSnapshot().llmCalls, 0);
});

test('MetricsCollector snapshot is a copy and reset clears counters', () => {
  const m = new MetricsCollector();
  m.recordUserAction('approve', {});
  const snap = m.snapshot();
  snap.gatePass = 999;
  assert.equal(m.snapshot().gatePass, 1, 'snapshot must be a defensive copy');
  m.reset();
  assert.equal(m.hasActivity(), false);
  assert.equal(m.snapshot().gatePass, 0);
});
