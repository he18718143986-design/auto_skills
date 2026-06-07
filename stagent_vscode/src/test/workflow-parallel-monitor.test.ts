import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { WorkflowParallelMonitor } from '../WorkflowParallelMonitor';

test('recordWaveStart returns incrementing indices and opens a wave', () => {
  const m = new WorkflowParallelMonitor();
  assert.equal(m.recordWaveStart(['a', 'b']), 1);
  assert.equal(m.recordWaveStart(['c']), 2);
  const open = m.getWaveMetrics();
  // 第一个波次仍 open（未 complete），第二个覆盖 openWave 指针
  assert.equal(open.length, 1);
  assert.equal(open[0].waveIndex, 2);
  assert.equal(open[0].parallelCount, 1);
});

test('recordWaveComplete moves the open wave into metrics with completedAt', () => {
  const m = new WorkflowParallelMonitor();
  const idx = m.recordWaveStart(['a', 'b']);
  m.recordWaveComplete(idx);
  const metrics = m.getWaveMetrics();
  assert.equal(metrics.length, 1);
  assert.equal(metrics[0].waveIndex, idx);
  assert.equal(typeof metrics[0].completedAt, 'string');
  // openWave 已清空：再次 detectPotentialDeadlock 必为 null
  assert.equal(m.detectPotentialDeadlock(-1), null);
});

test('finalizeOpenWave flushes a still-open wave into metrics', () => {
  const m = new WorkflowParallelMonitor();
  m.recordWaveStart(['x']);
  m.finalizeOpenWave();
  const metrics = m.getWaveMetrics();
  assert.equal(metrics.length, 1);
  assert.equal(metrics[0].stageIds[0], 'x');
  assert.equal(metrics[0].completedAt, undefined);
});

test('detectPotentialDeadlock returns null with no open wave and a hint when overdue', () => {
  const m = new WorkflowParallelMonitor();
  assert.equal(m.detectPotentialDeadlock(), null);
  m.recordWaveStart(['s1', 's2']);
  const hint = m.detectPotentialDeadlock(-1);
  assert.ok(hint && hint.includes('parallel-wave-1-stuck'));
  assert.ok(hint!.includes('s1,s2'));
});

test('buildWaveDebugPayload reports stage ids and parallel count', () => {
  const m = new WorkflowParallelMonitor();
  const idx = m.recordWaveStart(['a', 'b', 'c']);
  const payload = m.buildWaveDebugPayload(idx);
  assert.equal(payload.waveIndex, idx);
  assert.deepEqual(payload.stageIds, ['a', 'b', 'c']);
  assert.equal(payload.parallelCount, 3);
});

test('buildWaveDebugPayload tolerates an unknown wave index', () => {
  const m = new WorkflowParallelMonitor();
  const payload = m.buildWaveDebugPayload(99);
  assert.deepEqual(payload.stageIds, []);
  assert.equal(payload.parallelCount, 0);
});
