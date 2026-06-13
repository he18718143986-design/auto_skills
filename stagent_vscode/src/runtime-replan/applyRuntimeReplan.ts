import type { Stage, WorkflowInstance } from '../WorkflowDefinition';
import { createPendingRuntime } from './createPendingRuntime';
import { nextLedgerAfterInsert } from './replanBudget';
import type { RuntimeReplanAction, RuntimeReplanApplyResult } from './types';
import { mergeLedgerIntoRuntime, readReplanLedger } from './types';

function alignRuntimesToStages(
  stages: Stage[],
  existingRuntimes: WorkflowInstance['stageRuntimes'],
  newStage: Stage,
): { ok: true; runtimes: WorkflowInstance['stageRuntimes'] } | { ok: false; missingId: string } {
  const byId = new Map(existingRuntimes.map((rt) => [rt.stageId, rt]));
  const runtimes: WorkflowInstance['stageRuntimes'] = [];
  for (const s of stages) {
    if (s.id === newStage.id) {
      runtimes.push(createPendingRuntime(newStage));
      continue;
    }
    const rt = byId.get(s.id);
    if (!rt) {
      return { ok: false, missingId: s.id };
    }
    runtimes.push(rt);
  }
  return { ok: true, runtimes };
}

/**
 * 在 anchor 之后插入 replan stage，并对齐 stageRuntimes / currentStageIndex。
 * POC 核心突变函数；执行器接入时应 scheduleSave 前调用。
 */
export function applyRuntimeReplan(
  instance: WorkflowInstance,
  action: RuntimeReplanAction,
): RuntimeReplanApplyResult {
  const { anchorStageId, stage: newStage, trigger } = action;
  const stages = [...instance.definition.stages];
  const afterIdx = stages.findIndex((s) => s.id === anchorStageId);
  if (afterIdx < 0) {
    return { ok: false, reason: 'anchor-not-found', detail: anchorStageId };
  }
  if (stages.some((s) => s.id === newStage.id)) {
    return { ok: false, reason: 'already-inserted', detail: newStage.id };
  }

  const insertIndex = afterIdx + 1;
  stages.splice(insertIndex, 0, newStage);

  const aligned = alignRuntimesToStages(stages, instance.stageRuntimes, newStage);
  if (!aligned.ok) {
    return { ok: false, reason: 'runtime-misaligned', detail: aligned.missingId };
  }

  let currentStageIndex = instance.currentStageIndex;
  if (currentStageIndex >= insertIndex) {
    currentStageIndex += 1;
  }
  // 跳转到新插入的 replan stage 先执行
  currentStageIndex = insertIndex;

  const testRt = aligned.runtimes.find((rt) => rt.stageId === trigger.testRunStageId);
  if (testRt) {
    const ledger = readReplanLedger(testRt.outputs);
    mergeLedgerIntoRuntime(
      testRt,
      nextLedgerAfterInsert(ledger, trigger.sliceSemantic, newStage.id, trigger.kind),
    );
  }

  return {
    ok: true,
    instance: {
      ...instance,
      definition: {
        ...instance.definition,
        stages,
      },
      stageRuntimes: aligned.runtimes,
      currentStageIndex,
    },
    insertedStageId: newStage.id,
    insertIndex,
    action,
  };
}
