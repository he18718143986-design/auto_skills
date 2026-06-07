import type { ExecStageStatus } from './stageStatusPolicy';

export interface StageTimelineItem {
  id: string;
  title: string;
  status: ExecStageStatus;
  isDecisionStage?: boolean;
  selected?: boolean;
}

/** 决策阶段始终顶层展示；其余连续阶段合并为可折叠「执行步骤」组。 */
export type ExecTimelineNode =
  | { type: 'decision'; stage: StageTimelineItem }
  | { type: 'segment-fold'; segmentKey: string; stages: StageTimelineItem[] };

const ACTIVE_STATUSES = new Set(['running', 'retrying', 'error', 'paused', 'waiting-questions']);

export function buildExecTimelineNodes(stages: StageTimelineItem[]): ExecTimelineNode[] {
  const nodes: ExecTimelineNode[] = [];
  let buffer: StageTimelineItem[] = [];

  const flushSegment = (): void => {
    if (buffer.length === 0) {
      return;
    }
    nodes.push({
      type: 'segment-fold',
      segmentKey: buffer[0]!.id,
      stages: [...buffer],
    });
    buffer = [];
  };

  for (const st of stages) {
    if (st.isDecisionStage) {
      flushSegment();
      nodes.push({ type: 'decision', stage: st });
    } else {
      buffer.push(st);
    }
  }
  flushSegment();
  return nodes;
}

export function timelineFoldNeedsAttention(stages: StageTimelineItem[]): boolean {
  return stages.some((st) => ACTIVE_STATUSES.has(st.status));
}

export interface ExecTimelineFoldState {
  segmentExpandedByKey: Record<string, boolean>;
}

export function shouldExpandSegmentFold(
  fold: ExecTimelineFoldState,
  segmentKey: string,
  viewStageId: string | null,
  stages: StageTimelineItem[],
): boolean {
  if (fold.segmentExpandedByKey[segmentKey]) {
    return true;
  }
  for (const st of stages) {
    if (viewStageId === st.id) {
      return true;
    }
    if (ACTIVE_STATUSES.has(st.status)) {
      return true;
    }
  }
  return false;
}
