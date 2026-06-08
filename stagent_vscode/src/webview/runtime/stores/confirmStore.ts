import type { ConfirmState } from './types';

export const confirmStore: ConfirmState = {
  workflowDef: null,
  planSummary: null,
  stageSourceSummary: [],
  workflowWarnings: [],
  lastGeneratedStageIds: [],
  selectedStageId: null,
  settingsProfile: null,
  profileGateDiff: [],
  experienceReferencesUsed: 0,
  decisionBoard: null,
  decisionMode: 'inline-pause',
  decisionResolutions: {},
  planBlocked: false,
  taskTypeClassification: null,
  taskTypeLocked: false,
};

export function resetConfirmStore(): void {
  confirmStore.workflowDef = null;
  confirmStore.planSummary = null;
  confirmStore.stageSourceSummary = [];
  confirmStore.workflowWarnings = [];
  confirmStore.lastGeneratedStageIds = [];
  confirmStore.selectedStageId = null;
  confirmStore.settingsProfile = null;
  confirmStore.profileGateDiff = [];
  confirmStore.experienceReferencesUsed = 0;
  confirmStore.decisionBoard = null;
  confirmStore.decisionMode = 'inline-pause';
  confirmStore.decisionResolutions = {};
  confirmStore.planBlocked = false;
  confirmStore.taskTypeClassification = null;
  confirmStore.taskTypeLocked = false;
}
