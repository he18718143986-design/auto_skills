import type * as vscode from 'vscode';
import type { WorkflowDefinition } from './WorkflowDefinition';
import { orchestratePostParseValidation } from './WorkflowGenerationOrchestrator';
import { HOST_INPUT_PAGE_BUSY_TITLES as INPUT_PAGE_BUSY_TITLES } from './WebviewInputGenerationUiHost';
import { buildProfileGateDiff } from './StagentProfileDiff';
import { readSettingsProfileId } from './StagentSettings';
import {
  buildTaskTypeClassificationInfo,
  resolveGeneratedTaskType,
  workflowHasZoomOutStage,
  type KnownTaskType,
} from './TaskTypeResolution';
import { withSessionFields } from './InstanceSession';
import type { GenerationContext } from './WorkflowGenerationContext';
import {
  emitSuccessfulWorkflowGenerated,
  routeBlockedValidationOutcome,
} from './ValidationResultRouter';
import type { GenerationRunnerHost, RunWorkflowGenerationParams } from './WorkflowGenerationRunner';
import { GENERATION_OPERATION_WORKFLOW } from './generation/GenerationOperationIds';

function profileFieldsForWorkflowGenerated(): {
  settingsProfile: string;
  profileGateDiff: string[];
} {
  const profileId = readSettingsProfileId();
  return {
    settingsProfile: profileId,
    profileGateDiff: buildProfileGateDiff(profileId),
  };
}

export async function finalizeAndEmitWorkflow(
  host: GenerationRunnerHost,
  ctx: GenerationContext,
  params: RunWorkflowGenerationParams,
  wf: WorkflowDefinition,
  effectiveType: string,
  modelTaskType: string | undefined,
): Promise<void> {
  const { myGen, userInput, taskType, panel } = params;
  const { taskWorkspaceAbs, depGraph, complexity, experienceReferencesUsed } = ctx;

  host.postGenerationProgress(
    panel,
    GENERATION_OPERATION_WORKFLOW,
    'validating',
    INPUT_PAGE_BUSY_TITLES.workflowValidating,
    '校验字段、Rule20 与静态分析…',
  );

  const runtimeRule20On = host.isRuntimeRule20VerifyEnabled();
  const gates = host.readGenerationGates();
  const validation = await orchestratePostParseValidation({
    wf,
    effectiveType,
    uiTaskType: taskType,
    modelTaskType,
    userInput,
    taskWorkspaceAbs,
    depGraph,
    complexity,
    gates,
    runtimeRule20On,
    maxStageWarn: host.getMaxStageWarn(),
    normalizeWorkflow: (w, u, t) => host.normalizeWorkflow(w, u, t),
    isSuperseded: () => host.isGenerationSuperseded(myGen),
    debugLog: (stageId, event, attempt, payload) => host.debugLog(stageId, event, attempt, payload),
  });

  if (validation.kind === 'superseded') {
    return;
  }
  if (validation.kind !== 'success') {
    routeBlockedValidationOutcome(host, panel, validation);
    return;
  }

  const effectiveKnown = resolveGeneratedTaskType(modelTaskType, taskType) as KnownTaskType;
  const taskTypeClassification = buildTaskTypeClassificationInfo({
    uiTaskType: taskType,
    modelTaskType,
    effectiveType: effectiveKnown,
    isGreenfield: validation.workflow.meta?.isGreenfield,
    hasZoomOutStage: workflowHasZoomOutStage(validation.workflow.stages),
  });

  emitSuccessfulWorkflowGenerated(
    host,
    panel,
    validation.workflow,
    validation,
    experienceReferencesUsed,
    profileFieldsForWorkflowGenerated(),
    withSessionFields,
    { taskTypeClassification },
  );
}
