import type { BackendMessage, WorkflowDefinition } from '../../../WorkflowDefinition';
import {
  isGenerationTraceStageId,
  TRACE_STAGE_TASK_POLISH,
} from '../../../generation/GenerationTraceStageIds';
import {
  GENERATION_OPERATION_POLISH,
  GENERATION_OPERATION_WORKFLOW,
} from '../../../generation/GenerationOperationIds';
import { confirmStore, inputStore } from '../stores';
import { show } from '../shell';
import { renderConfirmBlock } from '../confirm-renderers/ConfirmBlockRenderer';
import { renderRepairInfo } from '../confirm-renderers/RepairInfoRenderer';
import { renderWorkflowWarnings } from '../confirm-renderers/WorkflowWarningsRenderer';
import { renderPlanSummaryAndDiff } from '../confirm-renderers/PlanSummaryRenderer';
import {
  applyTaskTypeClassificationFromMessage,
  renderTaskTypeClassification,
} from '../confirm-renderers/TaskTypeClassificationRenderer';
import { applySessionFromBackend } from '../session';
import {
  clearInputPageBusy,
  isPolishAssistantVisible,
  renderGenStatusDetail,
  scrollChatPanelToBottom,
  sendGenerateWorkflow,
  showPolishResult,
  syncInputActionsVisibility,
  syncPolishResultHeight,
  updateInputPageProgress,
} from '../view-input';
import { renderClarifyOverlay } from '../view-input-clarify';
import {
  renderConfirmFooter,
  renderPlanArtifactsPanel,
  renderPlanDagGraph,
  renderPlanStageCards,
  renderConfirmTimeline,
  showConfirmDetail,
} from '../view-confirm';
import type { BackendMessageHandler } from './types';

function handleWorkflowGenerated(msg: Extract<BackendMessage, { type: 'workflowGenerated' }>): void {
  clearInputPageBusy();
  confirmStore.workflowDef = msg.workflow as WorkflowDefinition;
  if (msg.instanceKey || msg.sessionId) {
    applySessionFromBackend(msg as { instanceKey?: string; sessionId?: string });
  }
  confirmStore.planSummary = msg.planSummary || null;
  confirmStore.stageSourceSummary = msg.stageSourceSummary || [];
  confirmStore.workflowWarnings = msg.warnings || [];
  confirmStore.settingsProfile = msg.settingsProfile ?? null;
  confirmStore.profileGateDiff = Array.isArray(msg.profileGateDiff) ? msg.profileGateDiff : [];
  confirmStore.experienceReferencesUsed =
    typeof msg.experienceReferencesUsed === 'number' ? msg.experienceReferencesUsed : 0;
  confirmStore.selectedStageId = confirmStore.workflowDef?.stages?.[0]?.id ?? null;
  applyTaskTypeClassificationFromMessage(msg);

  renderConfirmBlock(msg);
  renderTaskTypeClassification();
  renderRepairInfo(msg);
  renderWorkflowWarnings(msg);
  renderPlanSummaryAndDiff(msg);

  renderConfirmFooter();
  renderPlanArtifactsPanel();
  renderPlanDagGraph();
  renderPlanStageCards();
  renderConfirmTimeline();
  showConfirmDetail();
  show('confirm');
  inputStore.lastPolishContext = null;
}

function handleGenerationProgress(msg: Extract<BackendMessage, { type: 'generationProgress' }>): void {
  if (msg.operation === GENERATION_OPERATION_POLISH) {
    inputStore.inputBusyOp = GENERATION_OPERATION_POLISH;
    return;
  }
  if (msg.operation === GENERATION_OPERATION_WORKFLOW) {
    inputStore.inputBusyOp = GENERATION_OPERATION_WORKFLOW;
  }
  updateInputPageProgress(msg.message, msg.detail);
}

function handleTaskWorkspacePathPicked(
  msg: Extract<BackendMessage, { type: 'taskWorkspacePathPicked' }>,
): void {
  (document.getElementById('task-workspace-path') as HTMLInputElement).value = msg.path || '';
  syncInputActionsVisibility();
}

function handleClarifyQuestions(msg: Extract<BackendMessage, { type: 'clarifyQuestions' }>): void {
  const input = inputStore.pendingClarifyInput;
  inputStore.pendingClarifyInput = null;
  const questions = Array.isArray(msg.questions) ? msg.questions : [];
  if (!input) {
    // Race (e.g. ESC-cancel before clarifyQuestions arrives, or duplicate): never leave the spinner stuck.
    clearInputPageBusy();
    return;
  }
  if (questions.length === 0) {
    sendGenerateWorkflow(input);
  } else {
    renderClarifyOverlay(input, questions);
  }
}

function handleGenerationCancelled(): void {
  inputStore.pendingClarifyInput = null;
  clearInputPageBusy();
}

function handleUserTaskPolished(msg: Extract<BackendMessage, { type: 'userTaskPolished' }>): void {
  if (msg.instanceKey || msg.sessionId) {
    applySessionFromBackend(msg as { instanceKey?: string; sessionId?: string });
  }
  showPolishResult(msg.text || '', !!msg.fromCache);
}

function handleGenerationStreamChunk(msg: Extract<BackendMessage, { type: 'streamChunk' }>): void {
  if (!isGenerationTraceStageId(msg.stageId)) {
    return;
  }
  inputStore.genStreamChars += String(msg.chunk || '').length;
  const stream = document.getElementById('gen-stream');
  stream!.textContent += msg.chunk;
  if (msg.stageId === TRACE_STAGE_TASK_POLISH && isPolishAssistantVisible()) {
    document.getElementById('polish-loading')!.style.display = 'none';
    const edit = document.getElementById('polish-result-edit') as HTMLTextAreaElement;
    edit.style.display = 'block';
    edit.value += msg.chunk;
    syncInputActionsVisibility();
    syncPolishResultHeight();
  } else if (inputStore.inputBusyOp === GENERATION_OPERATION_WORKFLOW) {
    renderGenStatusDetail();
    scrollChatPanelToBottom();
  }
}

export const generationHandlers: Record<string, BackendMessageHandler> = {
  workflowGenerated: (msg) => handleWorkflowGenerated(msg as Extract<BackendMessage, { type: 'workflowGenerated' }>),
  generationProgress: (msg) =>
    handleGenerationProgress(msg as Extract<BackendMessage, { type: 'generationProgress' }>),
  generationCancelled: () => handleGenerationCancelled(),
  taskWorkspacePathPicked: (msg) =>
    handleTaskWorkspacePathPicked(msg as Extract<BackendMessage, { type: 'taskWorkspacePathPicked' }>),
  clarifyQuestions: (msg) => handleClarifyQuestions(msg as Extract<BackendMessage, { type: 'clarifyQuestions' }>),
  userTaskPolished: (msg) => handleUserTaskPolished(msg as Extract<BackendMessage, { type: 'userTaskPolished' }>),
};

export { handleGenerationStreamChunk };
