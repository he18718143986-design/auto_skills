import { runPreStageQualityGates } from './QualityGateRunner';
import { debugEventForQualityGate } from './DebugLogEvents';
import { GATE_ID_RED_GREEN_PRE_IMPL } from './QualityGateIds';
import type { Stage } from './WorkflowDefinition';
import type { ExecuteNextStageLoopParams } from './WorkflowExecutorTypes';
import { failWorkflowStageFromGate } from './WorkflowStageGateFailure';

export type PreGateWhen = 'always' | 'before-impl' | 'before-test-run';
export type PreGateOutcome = 'continue' | 'failed';

async function runQualityGateHostPreGate(
  params: ExecuteNextStageLoopParams,
  stage: Stage,
  stageIndex: number,
  when: PreGateWhen,
  attempt: number,
): Promise<PreGateOutcome> {
  if (!params.qualityGateExecutionHost) {
    return 'continue';
  }
  const runtime = params.instance.stageRuntimes[stageIndex];
  const result = await runPreStageQualityGates(
    {
      phase: 'pre-stage',
      when,
      workflow: params.instance.definition,
      stage,
      stageIndex,
      stageRuntime: runtime,
      instance: params.instance,
      instanceKey: params.currentInstanceKey,
      executionHost: params.qualityGateExecutionHost,
    },
    when,
  );
  for (const w of result.summary.warnings) {
    params.debugLog(stage.id, debugEventForQualityGate(w.gateId), attempt, { messages: w.messages });
    if (when === 'before-impl' && w.gateId === GATE_ID_RED_GREEN_PRE_IMPL) {
      params.postMessage(params.panel, {
        type: 'streamChunk',
        stageId: stage.id,
        chunk: `⚠️ 红绿门（I-25）：${w.messages.join('; ')}\n`,
      });
    }
  }
  if (result.outcome === 'failed') {
    const block = result.summary.blocks[0];
    const reason = block?.messages.join('; ') ?? 'quality gate blocked';
    return failWorkflowStageFromGate(
      params,
      stage,
      stageIndex,
      block?.gateId === GATE_ID_RED_GREEN_PRE_IMPL ? `红绿门（I-25）：${reason}` : reason,
    );
  }
  return 'continue';
}

const preGateRegistry: Record<PreGateWhen, Array<typeof runQualityGateHostPreGate>> = {
  always: [runQualityGateHostPreGate],
  'before-impl': [runQualityGateHostPreGate],
  'before-test-run': [runQualityGateHostPreGate],
};

export async function runPreGateRegistry(
  params: ExecuteNextStageLoopParams,
  stage: Stage,
  stageIndex: number,
  when: PreGateWhen,
  attempt: number,
): Promise<PreGateOutcome> {
  for (const handler of preGateRegistry[when]) {
    const outcome = await handler(params, stage, stageIndex, when, attempt);
    if (outcome === 'failed') {
      return 'failed';
    }
  }
  return 'continue';
}
