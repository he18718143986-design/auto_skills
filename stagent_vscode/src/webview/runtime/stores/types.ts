import type { WorkflowDefinition } from '../../../WorkflowDefinition';
import type { TaskTypeClassificationInfo } from '../../../TaskTypeResolution';
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

export interface DecisionBoardItemView {
  stageId: string;
  stageTitle: string;
  kind: string;
  provenance: string;
  matchScore: number;
  conflictScore: number;
  ruleRefs: number[];
  proposal?: string;
  reasoning?: string;
  requiresUser: boolean;
}

export interface DecisionBoardView {
  items: DecisionBoardItemView[];
  summary: { total: number; auto: number; needsReview: number };
}

export interface DecisionResolutionState {
  decisionRecord: string;
  provenance: string;
  resolved: boolean;
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
  decisionBoard: DecisionBoardView | null;
  decisionMode: 'inline-pause' | 'frontloaded';
  decisionResolutions: Record<string, DecisionResolutionState>;
  /** 计划硬阻断（confirm-block）；决策闸门须与此合并。 */
  planBlocked: boolean;
  /** B-R1：场景判别摘要（确认页展示依据）。 */
  taskTypeClassification: TaskTypeClassificationInfo | null;
  /** B-R1：锁定后不可再改 taskType / isGreenfield。 */
  taskTypeLocked: boolean;
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
