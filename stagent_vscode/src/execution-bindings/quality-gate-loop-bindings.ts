import type { ExecuteNextStageLoopParams } from '../WorkflowExecutor';
import { readEngineMemoryExperienceEnabled } from '../WorkflowEngineSettingsReaders';
import type { WorkflowEngineExecutionHost } from './types';
import { qualityGateSettingsReaders } from './quality-gate-settings';
import { DEBUG_EVENT_EXPERIENCE_READ_WARN } from '../DebugLogEvents';
import { WORKFLOW_LEVEL_STAGE_ID } from '../workflow/WorkflowLevelIds';

export function buildQualityGateLoopBindings(
  engine: WorkflowEngineExecutionHost,
): Pick<
  ExecuteNextStageLoopParams,
  | 'architectureDepthScoringEnabled'
  | 'testRunFailurePlaybookEnabled'
  | 'getWorkspaceRoot'
  | 'memoryExperienceEnabled'
  | 'warnOnExperienceReadFailure'
> {
  const readers = qualityGateSettingsReaders;
  const e = engine;
  return {
    architectureDepthScoringEnabled: readers.readArchitectureDepthScoringEnabled(),
    testRunFailurePlaybookEnabled: readers.readTestRunFailurePlaybookEnabled(),
    getWorkspaceRoot: () => e.getWorkspaceRootAbsolute(),
    memoryExperienceEnabled: readEngineMemoryExperienceEnabled(),
    warnOnExperienceReadFailure: (message) =>
      e.debugLog(WORKFLOW_LEVEL_STAGE_ID, DEBUG_EVENT_EXPERIENCE_READ_WARN, 0, { message }),
  };
}
