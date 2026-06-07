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
}
