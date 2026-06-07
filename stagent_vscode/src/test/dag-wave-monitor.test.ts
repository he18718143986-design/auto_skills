import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { executeNextStageLoop } from '../WorkflowExecutor';
import { WorkflowParallelMonitor } from '../WorkflowParallelMonitor';
import type { Stage, WorkflowInstance } from '../WorkflowDefinition';

function stage(id: string, dependsOn?: string[]): Stage {
  return {
    id,
    title: id,
    tool: 'llm-text',
    toolConfig: { type: 'llm-text', systemPrompt: `run ${id}` },
    input: { sources: [{ type: 'user-input', label: 'x' }], mergeStrategy: 'concat' },
    outputs: [{ key: 'out', format: 'text' }],
    pauseAfter: false,
    dependsOn,
  };
}

function makeInstance(stages: Stage[], dagMaxParallelism: number): WorkflowInstance {
  return {
    definition: {
      id: 'wf_wave_test',
      version: '2.0',
      meta: { title: 'dag', taskType: 'software', userInput: 'x', createdAt: new Date().toISOString() },
      globalConfig: { enableDagScheduler: true, dagMaxParallelism },
      stages,
    },
    currentStageIndex: 0,
    stageRuntimes: stages.map((s) => ({ stageId: s.id, status: 'pending', outputs: {}, retryCount: 0 })),
    status: 'running',
  } as WorkflowInstance;
}

test('runDagParallelWave drives WorkflowParallelMonitor start/complete callbacks', async () => {
  const stages = [
    stage('stage_a'),
    stage('stage_b', ['stage_a']),
    stage('stage_c', ['stage_a']),
    stage('stage_d', ['stage_b', 'stage_c']),
  ];
  const instance = makeInstance(stages, 4);
  const monitor = new WorkflowParallelMonitor();
  const startedWaves: string[][] = [];

  await executeNextStageLoop({
    instance,
    panel: {},
    currentInstanceKey: undefined,
    setCurrentInstanceKey: () => {},
    evaluateSkipCondition: () => false,
    postMessage: () => {},
    scheduleSave: () => {},
    persistMilestone: () => {},
    debugLog: () => {},
    primaryOutputKey: (s) => s.outputs[0].key,
    ensureTaskDir: () => {},
    resolveInput: async () => '',
    executeLlmText: async (stageId) => `ok:${stageId}`,
    applyPatchInstructions: async () => {},
    resolveTaskFilePath: (_i, p) => p,
    resolveOutputPath: (_i, p) => p,
    runCodeRunner: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    isCancellationError: () => false,
    enableDagScheduler: true,
    dagMaxParallelism: 4,
    onDagParallelWaveStart: (stageIds) => {
      startedWaves.push([...stageIds]);
      return monitor.recordWaveStart(stageIds);
    },
    onDagParallelWaveComplete: (waveIndex) => {
      monitor.recordWaveComplete(waveIndex);
      return monitor.buildWaveDebugPayload(waveIndex);
    },
  });

  assert.equal(instance.status, 'completed');
  // 至少有一个并行波次包含 stage_b 与 stage_c
  const parallelWave = startedWaves.find((w) => w.includes('stage_b') && w.includes('stage_c'));
  assert.ok(parallelWave, 'expected a wave containing both stage_b and stage_c');
  const metrics = monitor.getWaveMetrics();
  assert.ok(metrics.length >= 1);
  // 所有记录的波次都应已完成（completedAt 写入）
  assert.ok(metrics.every((m) => typeof m.completedAt === 'string'));
});

test('dag wave monitor baseline: records stage timings per wave', async () => {
  const stages = [
    stage('stage_a'),
    stage('stage_b', ['stage_a']),
    stage('stage_c', ['stage_a']),
    stage('stage_d', ['stage_b', 'stage_c']),
  ];
  const instance = makeInstance(stages, 2);
  const monitor = new WorkflowParallelMonitor();

  await executeNextStageLoop({
    instance,
    panel: {},
    currentInstanceKey: undefined,
    setCurrentInstanceKey: () => {},
    evaluateSkipCondition: () => false,
    postMessage: () => {},
    scheduleSave: () => {},
    persistMilestone: () => {},
    debugLog: () => {},
    primaryOutputKey: (s) => s.outputs[0].key,
    ensureTaskDir: () => {},
    resolveInput: async () => '',
    executeLlmText: async (stageId) => {
      await new Promise((r) => setTimeout(r, 5));
      return `ok:${stageId}`;
    },
    applyPatchInstructions: async () => {},
    resolveTaskFilePath: (_i, p) => p,
    resolveOutputPath: (_i, p) => p,
    runCodeRunner: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    isCancellationError: () => false,
    enableDagScheduler: true,
    dagMaxParallelism: 2,
    onDagParallelWaveStart: (stageIds) => monitor.recordWaveStart(stageIds),
    onDagParallelWaveComplete: (waveIndex) => {
      monitor.recordWaveComplete(waveIndex);
      return monitor.buildWaveDebugPayload(waveIndex);
    },
  });

  assert.equal(instance.status, 'completed');
  const metrics = monitor.getWaveMetrics();
  const parallelMetrics = metrics.filter((m) => m.parallelCount >= 2);
  assert.ok(parallelMetrics.length >= 1, 'expected at least one parallel wave recorded');
  assert.ok(parallelMetrics.every((m) => typeof m.completedAt === 'string'));
  for (const m of parallelMetrics) {
    const elapsedMs = Date.parse(m.completedAt!) - Date.parse(m.startedAt);
    assert.ok(elapsedMs >= 5, 'mock stage delay should appear in wave elapsed time');
  }
});
