import { buildWorkflowGeneratorPrompt } from './WorkflowPrompts';
import { isAutoTaskType } from './TaskTypeResolution';
import { loadAdrContextForGeneration } from './AdrContextLoader';
import { loadCodebaseContext } from './CodebaseContextLoader';
import { loadExperienceForGeneration } from './ExperienceLoader';
import { loadPromptSlotsForGeneration } from './PromptSlotLoader';
import type { GenerationRunnerHost, RunWorkflowGenerationParams } from './WorkflowGenerationRunner';
import type { buildGeneratorCodebaseContextBlock } from './WorkflowGeneration';

export interface GenerationContext {
  taskWorkspaceAbs: string;
  codebaseContext: string;
  complexity: ReturnType<typeof buildGeneratorCodebaseContextBlock>['complexity'];
  depGraph: ReturnType<typeof buildGeneratorCodebaseContextBlock>['depGraph'];
  experienceReferencesUsed: number;
  systemPrompt: string;
  userPayload: string;
}

export async function buildGenerationContext(
  host: GenerationRunnerHost,
  params: RunWorkflowGenerationParams,
): Promise<GenerationContext | null> {
  const {
    userInput,
    taskType,
    readPromptVersionsEnabled,
    readExperienceInjectOnGenerate,
    readGlossaryEnabled,
  } = params;

  const codebase = loadCodebaseContext(host, params);
  if (!codebase) {
    return null;
  }
  const { taskWorkspaceAbs, codebaseContext, complexity, depGraph } = codebase;

  const promptSlots = loadPromptSlotsForGeneration(
    taskWorkspaceAbs,
    readPromptVersionsEnabled,
    (stageId, event, attempt, payload) => host.debugLog(stageId, event, attempt, payload),
  );

  const { experienceFewShot, experienceReferencesUsed } = loadExperienceForGeneration(
    taskWorkspaceAbs,
    taskType,
    readExperienceInjectOnGenerate,
    (stageId, event, attempt, payload) => host.debugLog(stageId, event, attempt, payload),
  );

  const adrContext = await loadAdrContextForGeneration(
    taskWorkspaceAbs,
    readGlossaryEnabled,
    (reason, context) => host.degraded(reason, context),
    (stageId, event, attempt, payload) => host.debugLog(stageId, event, attempt, payload),
  );

  const systemPrompt = buildWorkflowGeneratorPrompt(taskType, {
    userInput,
    codebaseContext,
    experienceFewShot,
    adrContext,
    promptSlots,
  });

  const userPayload = isAutoTaskType(taskType)
    ? `taskType: auto（请根据用户任务在 meta.taskType 中选择其一）\n\n用户任务：\n${userInput}`
    : `taskType: ${taskType}（用户指定覆盖）\n\n用户任务：\n${userInput}`;

  return {
    taskWorkspaceAbs,
    codebaseContext,
    complexity,
    depGraph,
    experienceReferencesUsed,
    systemPrompt,
    userPayload,
  };
}
