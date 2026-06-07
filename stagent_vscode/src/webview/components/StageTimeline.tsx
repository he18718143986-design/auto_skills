/** Preact：执行页阶段时间线（决策阶段常显，其余步骤默认折叠）。 */
import { h } from 'preact';
import { wMsg } from '../l10n/wMsg';
import {
  buildExecTimelineNodes,
  shouldExpandSegmentFold,
  timelineFoldNeedsAttention,
  type StageTimelineItem,
} from '../shared/execTimelineModel';
import { confidenceLabel } from '../shared/execTimelineConfidence';
import { execStore } from '../runtime/stores';

export type { StageTimelineItem };

const maps = execStore.stageMaps;

export interface StageTimelineProps {
  stages: StageTimelineItem[];
  onSelect: (stageId: string) => void;
  viewStageId?: string | null;
}

function statusIcon(status: string): string {
  const map: Record<string, string> = {
    pending: '⏳',
    running: '⚡',
    'waiting-questions': '❓',
    paused: '👀',
    done: '✅',
    skipped: '⏭',
    error: '❌',
    retrying: '🔄',
  };
  return map[status] || '⏳';
}

function StageRow(props: {
  stage: StageTimelineItem;
  onSelect: (stageId: string) => void;
  nested?: boolean;
}) {
  const { stage: st, onSelect, nested } = props;
  const conf = maps.stageConfidence[st.id];
  const confView =
    conf && typeof conf.score === 'number' && !Number.isNaN(conf.score)
      ? { score: conf.score, level: conf.level || 'medium', reasons: conf.reasons || [] }
      : null;
  return (
    <li
      key={st.id}
      class={[st.selected ? 'selected' : '', nested ? 'timeline-auto-child' : ''].filter(Boolean).join(' ') || undefined}
      data-id={st.id}
      title={wMsg('stagent.webview.exec.stageClickHint')}
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(st.id);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(st.id);
        }
      }}
    >
      <span>
        {statusIcon(st.status)} {st.title}
        {st.isDecisionStage ? ` [${wMsg('stagent.webview.exec.badgeDecision')}]` : ''}
      </span>
      {confView ? (
        <span
          className={`confidence conf-${confView.level}`}
          title={(confView.reasons || []).join('\n')}
        >
          {confidenceLabel(confView)}
        </span>
      ) : null}
    </li>
  );
}

function SegmentFold(props: {
  segmentKey: string;
  stages: StageTimelineItem[];
  viewStageId: string | null;
  onSelect: (stageId: string) => void;
}) {
  const fold = execStore.timelineFold;
  const open = shouldExpandSegmentFold(fold, props.segmentKey, props.viewStageId, props.stages);
  const summary = wMsg('stagent.webview.exec.autoFoldSegment', String(props.stages.length));
  return (
    <li
      class={[
        'timeline-auto-fold',
        timelineFoldNeedsAttention(props.stages) ? 'timeline-auto-fold-attn' : '',
      ]
        .filter(Boolean)
        .join(' ') || undefined}
    >
      <details
        open={open}
        onToggle={(e) => {
          fold.segmentExpandedByKey[props.segmentKey] = (e.target as HTMLDetailsElement).open;
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <summary>{summary}</summary>
        <ul class="timeline-auto-children">
          {props.stages.map((st) => (
            <StageRow key={st.id} stage={st} onSelect={props.onSelect} nested />
          ))}
        </ul>
      </details>
    </li>
  );
}

export function StageTimeline(props: StageTimelineProps) {
  const { stages, onSelect, viewStageId = null } = props;
  const nodes = buildExecTimelineNodes(stages);

  return (
    <ul class="timeline-exec">
      {nodes.map((node) => {
        if (node.type === 'decision') {
          return <StageRow key={node.stage.id} stage={node.stage} onSelect={onSelect} />;
        }
        return (
          <SegmentFold
            key={node.segmentKey}
            segmentKey={node.segmentKey}
            stages={node.stages}
            viewStageId={viewStageId}
            onSelect={onSelect}
          />
        );
      })}
    </ul>
  );
}
