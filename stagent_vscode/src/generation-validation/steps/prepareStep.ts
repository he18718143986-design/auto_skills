import { validateAndPrepareGeneratedWorkflow } from '../../WorkflowEngineHelpers';
import type { GenerationValidationOutcome, PipelineContext } from '../types';

export function runPrepareStep(ctx: PipelineContext): GenerationValidationOutcome | { wf: PipelineContext['wf'] } {
  const prepared = validateAndPrepareGeneratedWorkflow(ctx.wf, ctx.effectiveType);
  if (ctx.isSuperseded()) {
    return { kind: 'superseded' };
  }
  if (prepared.errors.length > 0) {
    return { kind: 'validation-errors', workflow: prepared.workflow, errors: prepared.errors };
  }
  return { wf: prepared.workflow };
}
