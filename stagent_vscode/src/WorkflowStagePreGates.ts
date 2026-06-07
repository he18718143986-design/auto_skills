import type { Stage } from './WorkflowDefinition';
import type { ExecuteNextStageLoopParams } from './WorkflowExecutorTypes';
import { runPreGateRegistry } from './PreGateRegistry';

export { failWorkflowStageFromGate } from './WorkflowStageGateFailure';

export async function applyPreStageQualityGates(
  params: ExecuteNextStageLoopParams,
  stage: Stage,
  stageIndex: number,
  when: 'always' | 'before-impl' | 'before-test-run',
  attempt: number,
): Promise<'continue' | 'failed'> {
  return runPreGateRegistry(params, stage, stageIndex, when, attempt);
}
