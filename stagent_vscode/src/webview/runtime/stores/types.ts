import type { WorkflowDefinition } from '../../../WorkflowDefinition';
import type { ExecStageStatus } from '../../shared/stageStatusPolicy';

export interface StageMaps {
  stageStatus: Record<string, ExecStageStatus>;
  stageOutputs: Record<string, string>;
  stageConfidence: Record<string, { score: number; level: string; reasons: string[] }>;
  stageArtifacts: Record<string, unknown[]>;
  beforeQuestionsByStage: Record<string, unknown[]>;
  /** Buffered after-questions keyed by stage, so an out-of-order stageQuestions is not dropped. */
  afterQuestionsByStage: Record<string, unknown[]>;
  retryDisabledByStage: Record<string, boolean>;
}

export interface SessionState {
  sessionId: string | null;
  draftInstanceKey: string | null;
  activeInstanceKey: string | null;
}

export interface InputState {
  committedUserText: string;
  inputBusyOp: string | null;
  pendingClarifyInput: string | null;
  genStreamChars: number;
  genStatusDetailBase: string;
  lastPolishContext: { originalDraft: string; polishedAt: string } | null;
  polishOriginalDraft: string;
}

export interface ConfirmState {
  workflowDef: WorkflowDefinition | null;
  planSummary: unknown;
  stageSourceSummary: unknown[];
  workflowWarnings: unknown[];
  lastGeneratedStageIds: string[];
  selectedStageId: string | null;
  settingsProfile: string | null;
  profileGateDiff: string[];
  experienceReferencesUsed: number;
}

export interface ExecTimelineFoldState {
  segmentExpandedByKey: Record<string, boolean>;
}

export interface ExecState {
  currentRunStageId: string | null;
  currentPausedStageId: string | null;
  execOutputPinnedStageId: string | null;
  currentBeforeQuestionStageId: string | null;
  dagWaveActiveStageIds: string[];
  dagWaveIndex: number | null;
  llmUsageTotalTokens: number;
  timelineFold: ExecTimelineFoldState;
  stageMaps: StageMaps;
}
