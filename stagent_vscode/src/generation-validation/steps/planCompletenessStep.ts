import { blockIfRule20Violations, reverifyRule20AfterChange } from '../reverifyRule20';
import { lintPlanCompleteness, formatPlanCompletenessBlockReason } from '../../PlanCompletenessGate';
import {
  applyPostLintStructuralRepairs,
  formatStructuralRepairBlockReason,
  type StructuralRepairAction,
} from '../../WorkflowStructuralRepair';
import { validateAndPrepareGeneratedWorkflow } from '../../WorkflowEngineHelpers';
import type { VerifyResult } from '../../Rule20Verify';
import type { GenerationValidationOutcome, PipelineContext } from '../types';
import {
  DEBUG_EVENT_PLAN_COMPLETENESS_BLOCKED,
  DEBUG_EVENT_PLAN_STRUCTURAL_REPAIR,
} from '../../DebugLogEvents';
import { WORKFLOW_LEVEL_STAGE_ID } from '../../workflow/WorkflowLevelIds';

export type PlanCompletenessStepResult =
  | GenerationValidationOutcome
  | { wf: PipelineContext['wf']; structuralRepairs: StructuralRepairAction[]; verifyResult?: VerifyResult };

export function runPlanCompletenessStep(
  ctx: PipelineContext,
  wf: PipelineContext['wf'],
  verifyResult: VerifyResult | undefined,
): PlanCompletenessStepResult {
  let structuralRepairs: StructuralRepairAction[] = [];
  let currentWf = wf;
  let currentVerify = verifyResult;

  if (!ctx.gates.planCompletenessEnabled) {
    return { wf: currentWf, structuralRepairs, verifyResult: currentVerify };
  }

  let planIssues = lintPlanCompleteness(currentWf);
  if (planIssues.length > 0 && ctx.gates.planStructuralRepairMode === 'auto') {
    const repairResult = applyPostLintStructuralRepairs(currentWf, planIssues, {
      mode: 'auto',
      userInput: ctx.userInput,
      taskType: ctx.effectiveType,
    });
    if (repairResult.changed) {
      structuralRepairs = repairResult.actions;
      currentWf = ctx.normalizeWorkflow(repairResult.workflow, ctx.userInput, ctx.effectiveType);
      currentWf.meta = { ...currentWf.meta, taskType: ctx.effectiveType, taskWorkspacePath: ctx.taskWorkspaceAbs };
      ctx.debugLog(WORKFLOW_LEVEL_STAGE_ID, DEBUG_EVENT_PLAN_STRUCTURAL_REPAIR, 0, {
        actions: structuralRepairs.map((a) => a.code),
        stageIds: structuralRepairs.flatMap((a) => a.stageIds),
      });
      if (ctx.isSuperseded()) {
        return { kind: 'superseded' };
      }
      const repairedPrepared = validateAndPrepareGeneratedWorkflow(currentWf, ctx.effectiveType);
      if (repairedPrepared.errors.length > 0) {
        return {
          kind: 'plan-blocked',
          workflow: repairedPrepared.workflow,
          blockReasons: [
            ...repairedPrepared.errors,
            ...formatStructuralRepairBlockReason(structuralRepairs),
          ],
          structuralRepairs,
        };
      }
      currentWf = repairedPrepared.workflow;
      currentVerify = reverifyRule20AfterChange(ctx, currentWf);
      const rule20Blocked = blockIfRule20Violations(ctx, currentWf, currentVerify, {
        kind: 'plan-blocked',
        structuralRepairs,
        extraBlockReasons: formatStructuralRepairBlockReason(structuralRepairs),
      });
      if (rule20Blocked) {
        return rule20Blocked;
      }
      planIssues = lintPlanCompleteness(currentWf);
    }
  }

  if (planIssues.length > 0) {
    const blockReasons = [formatPlanCompletenessBlockReason(planIssues)];
    if (structuralRepairs.length > 0) {
      blockReasons.push(...formatStructuralRepairBlockReason(structuralRepairs));
    }
    ctx.debugLog(WORKFLOW_LEVEL_STAGE_ID, DEBUG_EVENT_PLAN_COMPLETENESS_BLOCKED, 0, {
      types: planIssues.map((i) => i.type),
      repaired: structuralRepairs.length > 0,
    });
    return { kind: 'plan-blocked', workflow: currentWf, blockReasons, structuralRepairs };
  }

  return { wf: currentWf, structuralRepairs, verifyResult: currentVerify };
}
