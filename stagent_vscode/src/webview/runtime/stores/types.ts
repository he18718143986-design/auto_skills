import type { QualityReportPayload } from '../../../quality-report/QualityReportTypes';
import type { WorkflowDefinition } from '../../../WorkflowDefinition';
import type { TaskTypeClassificationInfo } from '../../../TaskTypeResolution';
import type { EngineActivityKind, StageExecSemantic } from '../../../workflow-types/MessageTypes';
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
  /** 润色档位：auto 由引擎推断，light 简单任务，standard 复杂交付 */
  polishTier: 'auto' | 'light' | 'standard';
  /** 最近一次润色实际使用的档位（来自后端 userTaskPolished） */
  lastPolishTierUsed: 'light' | 'standard' | null;
  /** 输入页「高级：需求润色」折叠区是否展开 */
  polishToolsExpanded: boolean;
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
  plainSummary?: string;
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

export interface EngineActivityFeedItem {
  kind: EngineActivityKind;
  text: string;
  stageId?: string;
  timestamp?: string;
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
  /** 屏 4：引擎活动 Feed（engineActivity 消息累积）。 */
  engineActivityFeed: EngineActivityFeedItem[];
  /** 屏 4：阶段执行语义（deferred / self-healing）。 */
  stageExecSemantic: Record<string, StageExecSemantic>;
  /** 屏 4：自动修复链进行中（抑制 ErrorCard upstreamFix）。 */
  selfHealActive: boolean;
  /** 屏 5：workflowCompleted.qualityReport */
  qualityReport: QualityReportPayload | null;
}
