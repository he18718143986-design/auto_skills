import { findFixStageForTestRun } from '../gate-repair/GateRepairRouter';
import { CODE_RUNNER_EXIT_OUTPUT_KEY } from '../WorkflowOutputKeys';
import type { Stage, StageRuntime, WorkflowInstance } from '../WorkflowDefinition';
import { semanticNameFromTestRunStageId } from '../workflow/StageIdPatterns';
import {
  inferPythonTestFile,
  resolvePythonImplFileForFix,
} from '../workflow-self-heal/SelfHealStageFactory';
import { DEFAULT_FIX_EXHAUSTED_MAX_ATTEMPTS, FIX_CHAIN_OUTPUT_KEY } from './constants';
import type { RuntimeReplanTrigger } from './types';

export type FixChainLedger = {
  attempts: number;
};

const RE_FIX_IF_FAILED = /^stage_fix_if_failed_(.+)$/;

export function isFixIfFailedStageId(stageId: string): boolean {
  return RE_FIX_IF_FAILED.test(stageId);
}

export function semanticFromFixIfFailedStageId(stageId: string): string | undefined {
  return RE_FIX_IF_FAILED.exec(stageId)?.[1];
}

export function resolveTestRunStageIdFromFix(fixStageId: string): string | undefined {
  const semantic = semanticFromFixIfFailedStageId(fixStageId);
  return semantic ? `stage_test_run_${semantic}` : undefined;
}

export function emptyFixChainLedger(): FixChainLedger {
  return { attempts: 0 };
}

export function readFixChainLedger(outputs: Record<string, unknown>): FixChainLedger {
  const raw = outputs[FIX_CHAIN_OUTPUT_KEY];
  if (!raw || typeof raw !== 'object') {
    return emptyFixChainLedger();
  }
  const o = raw as FixChainLedger;
  return { attempts: typeof o.attempts === 'number' ? o.attempts : 0 };
}

export function mergeFixChainLedger(runtime: StageRuntime, patch: Partial<FixChainLedger>): void {
  const cur = readFixChainLedger(runtime.outputs);
  runtime.outputs[FIX_CHAIN_OUTPUT_KEY] = { ...cur, ...patch };
}

export function testRunStillFailing(testRunRt: StageRuntime | undefined): boolean {
  if (!testRunRt) {
    return false;
  }
  const exit = testRunRt.outputs[CODE_RUNNER_EXIT_OUTPUT_KEY];
  return typeof exit === 'number' && exit !== 0;
}

export function isFixExhausted(
  testRunRt: StageRuntime | undefined,
  maxAttempts: number = DEFAULT_FIX_EXHAUSTED_MAX_ATTEMPTS,
): boolean {
  if (!testRunRt || !testRunStillFailing(testRunRt)) {
    return false;
  }
  return readFixChainLedger(testRunRt.outputs).attempts >= maxAttempts;
}

export function findTestRunRuntime(instance: WorkflowInstance, testRunStageId: string): StageRuntime | undefined {
  return instance.stageRuntimes.find((rt) => rt.stageId === testRunStageId);
}

export function findTestRunStageIndex(instance: WorkflowInstance, testRunStageId: string): number {
  return instance.definition.stages.findIndex((s) => s.id === testRunStageId);
}

export function resolveFixReplanWriteTarget(
  fixStage: Stage | undefined,
  testRunStageId: string,
  stages?: readonly Stage[],
): string | undefined {
  const writeTarget = fixStage?.toolConfig;
  if (writeTarget && writeTarget.type === 'llm-text' && writeTarget.writeOutputToFile?.trim()) {
    return writeTarget.writeOutputToFile.trim();
  }
  if (stages?.length) {
    return (
      resolvePythonImplFileForFix(testRunStageId, stages) ??
      `${semanticNameFromTestRunStageId(testRunStageId) ?? 'impl'}.py`
    );
  }
  return inferPythonTestFile(testRunStageId) ?? `${semanticNameFromTestRunStageId(testRunStageId) ?? 'impl'}.py`;
}

export function summarizeTestRunFailure(testRunRt: StageRuntime | undefined): string | undefined {
  if (!testRunRt) {
    return undefined;
  }
  const stdout = testRunRt.outputs.stdout;
  const stderr = testRunRt.outputs.stderr;
  const parts = [
    typeof stdout === 'string' && stdout.trim() ? stdout.trim() : '',
    typeof stderr === 'string' && stderr.trim() ? stderr.trim() : '',
  ].filter(Boolean);
  return parts.length ? parts.join('\n').slice(0, 4000) : undefined;
}

export function buildFixExhaustedTrigger(params: {
  testRunStageId: string;
  testRunRt?: StageRuntime;
}): RuntimeReplanTrigger | null {
  const semantic = semanticNameFromTestRunStageId(params.testRunStageId);
  if (!semantic) {
    return null;
  }
  return {
    kind: 'fix-exhausted',
    testRunStageId: params.testRunStageId,
    sliceSemantic: semantic,
    message: summarizeTestRunFailure(params.testRunRt),
  };
}

export function findFixStageAnchor(instance: WorkflowInstance, sliceSemantic: string): string | undefined {
  const fixId = `stage_fix_if_failed_${sliceSemantic}`;
  if (instance.definition.stages.some((s) => s.id === fixId)) {
    return fixId;
  }
  const testRunId = `stage_test_run_${sliceSemantic}`;
  const runIdx = instance.definition.stages.findIndex((s) => s.id === testRunId);
  if (runIdx < 0) {
    return undefined;
  }
  return instance.definition.stages[runIdx]?.id;
}

export function stageHasDownstreamFixChain(
  definition: WorkflowInstance['definition'],
  testRunStageId: string,
): boolean {
  return !!findFixStageForTestRun(definition, testRunStageId);
}

export function isRuntimeReplanFixStageId(stageId: string): boolean {
  return stageId.startsWith('stage_runtime_replan_fix_');
}
