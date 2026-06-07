import { executeNextStageLoop } from '../../WorkflowExecutor';
import type { Stage, WorkflowInstance } from '../../WorkflowDefinition';

export interface DagBenchResult {
  parallelMs: number;
  sequentialMs: number;
  speedup: number;
  stageCount: number;
}

function benchStage(id: string, dependsOn?: string[]): Stage {
  return {
    id,
    title: id,
    tool: 'llm-text',
    toolConfig: { type: 'llm-text', systemPrompt: `bench ${id}` },
    input: { sources: [{ type: 'user-input', label: 'x' }], mergeStrategy: 'concat' },
    outputs: [{ key: 'out', format: 'text' }],
    pauseAfter: false,
    dependsOn,
  };
}

/** 8-stage fan-out / fan-in fixture（与 benchmark 脚本一致）。 */
export function buildDagBenchStages(): Stage[] {
  return [
    benchStage('stage_root'),
    benchStage('stage_a', ['stage_root']),
    benchStage('stage_b', ['stage_root']),
    benchStage('stage_c', ['stage_root']),
    benchStage('stage_d', ['stage_root']),
    benchStage('stage_join_ab', ['stage_a', 'stage_b']),
    benchStage('stage_join_cd', ['stage_c', 'stage_d']),
    benchStage('stage_final', ['stage_join_ab', 'stage_join_cd']),
  ];
}

function makeInstance(stages: Stage[], enableDag: boolean, dagMaxParallelism: number): WorkflowInstance {
  return {
    definition: {
      id: 'wf_dag_bench',
      version: '2.0',
      meta: {
        title: 'dag bench',
        taskType: 'software',
        userInput: 'x',
        createdAt: new Date().toISOString(),
      },
      globalConfig: enableDag ? { enableDagScheduler: true, dagMaxParallelism } : undefined,
      stages,
    },
    currentStageIndex: 0,
    stageRuntimes: stages.map((s) => ({
      stageId: s.id,
      status: 'pending' as const,
      outputs: {},
      retryCount: 0,
    })),
    status: 'running' as const,
  };
}

async function runOnce(enableDag: boolean, stageDelayMs: number, dagMaxParallelism: number): Promise<number> {
  const stages = buildDagBenchStages();
  const instance = makeInstance(stages, enableDag, dagMaxParallelism);
  const started = Date.now();
  await executeNextStageLoop({
    instance,
    panel: {},
    currentInstanceKey: 'bench',
    setCurrentInstanceKey: () => {},
    evaluateSkipCondition: () => false,
    postMessage: () => {},
    scheduleSave: () => {},
    persistMilestone: () => {},
    debugLog: () => {},
    primaryOutputKey: (s) => s.outputs[0]?.key ?? 'out',
    ensureTaskDir: () => '/tmp',
    resolveInput: async () => '',
    executeLlmText: async () => {
      if (stageDelayMs > 0) {
        await new Promise((r) => setTimeout(r, stageDelayMs));
      }
      return 'ok';
    },
    applyPatchInstructions: async () => {},
    resolveTaskFilePath: (_i, p) => p,
    resolveOutputPath: (_i, p) => p,
    runCodeRunner: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    isCancellationError: () => false,
    enableDagScheduler: enableDag,
    dagMaxParallelism,
  });
  if (instance.status !== 'completed') {
    throw new Error(`dag bench did not complete: status=${instance.status}`);
  }
  return Date.now() - started;
}

export async function runDagParallelBenchmark(options?: {
  stageDelayMs?: number;
  dagMaxParallelism?: number;
}): Promise<DagBenchResult> {
  const stageDelayMs = options?.stageDelayMs ?? 8;
  const dagMaxParallelism = options?.dagMaxParallelism ?? 4;
  const parallelMs = await runOnce(true, stageDelayMs, dagMaxParallelism);
  const sequentialMs = await runOnce(false, stageDelayMs, 1);
  const speedup = sequentialMs / Math.max(parallelMs, 1);
  return {
    parallelMs,
    sequentialMs,
    speedup,
    stageCount: buildDagBenchStages().length,
  };
}
