import type { NonLlmToolExecutionParams } from './WorkflowExecutorTypes';
import { executeNonLlmToolFromRegistry } from './NonLlmToolRunnerRegistry';

export {
  findFileWriteSourceRuntime,
  findStageRuntimeByOutputKey,
} from './non-llm-runners/helpers';

export async function executeNonLlmTool(params: NonLlmToolExecutionParams): Promise<boolean> {
  return executeNonLlmToolFromRegistry(params);
}
