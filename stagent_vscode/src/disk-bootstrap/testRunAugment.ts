import type { Stage } from '../WorkflowDefinition';
import { isTestRunStageId } from '../workflow/StageIdPatterns';
import { isCodeRunnerTool } from '../workflow/StageToolKinds';

/** 为 stage_test_run_* 的 code-runner 补全 pathBase/workingDir，使测试在工作区根执行。 */
export function augmentTestRunToWorkspaceRoot(stages: Stage[]): void {
  for (const s of stages) {
    if (!isTestRunStageId(s.id) || !isCodeRunnerTool(s.tool)) {
      continue;
    }
    const tc = s.toolConfig as { type: string; pathBase?: string; workingDir?: string };
    if (tc.type !== 'code-runner') {
      continue;
    }
    if (!tc.pathBase) {
      tc.pathBase = 'workspace';
      tc.workingDir = tc.workingDir ?? '.';
    }
  }
}
