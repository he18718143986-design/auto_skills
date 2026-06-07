import type { Stage } from './WorkflowDefinition';
import { postStageError, invariantStageError } from './WorkflowStageErrorHelpers';
import type { ExecuteNextStageLoopParams } from './WorkflowExecutorTypes';

export function failWorkflowStageFromGate(
  params: ExecuteNextStageLoopParams,
  stage: Stage,
  stageIndex: number,
  error: string,
): 'failed' {
  const runtime = params.instance.stageRuntimes[stageIndex];
  postStageError(params.panel, params.postMessage, runtime, invariantStageError(stage.id, error));
  runtime.status = 'error';
  params.instance.status = 'failed';
  params.scheduleSave();
  return 'failed';
}
