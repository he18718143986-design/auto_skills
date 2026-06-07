import type { WorkflowDefinition } from '../WorkflowDefinition';
import { injectFileWriteAfterImplStages, injectInitNpmWorkspaceStage } from './injectedStages';
import { augmentTestRunToWorkspaceRoot } from './testRunAugment';

export function applySoftwareDiskPipeline(wf: WorkflowDefinition): WorkflowDefinition {
  const stages = Array.isArray(wf.stages) ? [...wf.stages] : [];
  const nextStages = injectInitNpmWorkspaceStage(stages);
  const withBundles = injectFileWriteAfterImplStages(nextStages);
  augmentTestRunToWorkspaceRoot(withBundles);
  return { ...wf, stages: withBundles };
}
