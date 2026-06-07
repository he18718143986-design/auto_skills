import type { WorkflowDefinition } from './WorkflowDefinition';
import { validateWorkflowStructure } from './StructuralValidator';
import { validateStageConstraints } from './StageConstraintValidator';

export function validateGeneratedWorkflow(wf: WorkflowDefinition): string[] {
  return [...validateWorkflowStructure(wf), ...validateStageConstraints(wf)];
}
