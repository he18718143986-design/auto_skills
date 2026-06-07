/**
 * Mini DOM stub for mountStageTimeline in webview integration tests.
 *
 * PR-1 决策：采用 Mini DOM polyfill（非 props-only mock），因为
 * exec-timeline-auto-fold.test.ts 等集成测断言真实 DOM（details.open、折叠 summary 文案）。
 * Preact render 无法写入 MiniElement，故用 buildExecTimelineNodes 复刻 StageTimeline 结构。
 */
import {
  buildExecTimelineNodes,
  shouldExpandSegmentFold,
  timelineFoldNeedsAttention,
  type ExecTimelineFoldState,
  type StageTimelineItem,
} from '../webview/shared/execTimelineModel';
import { confidenceLabel, type StageConfidenceView } from '../webview/shared/execTimelineConfidence';
import type { MiniElement as MiniElementType } from './webview-script-test-harness';
import { MiniElement } from './webview-script-test-harness';

type TimelineMountProps = {
  stages: StageTimelineItem[];
  viewStageId?: string | null;
  onSelect: (stageId: string) => void;
};

function statusIcon(status: string): string {
  return (
    (
      {
        pending: '⏳',
        running: '⚡',
        'waiting-questions': '❓',
        paused: '👀',
        done: '✅',
        skipped: '⏭',
        error: '❌',
        retrying: '🔄',
      } as Record<string, string>
    )[status] || '⏳'
  );
}

function wMsgFromMap(l10n: Record<string, string>, key: string, ...args: string[]): string {
  let s = l10n[key] ?? key;
  args.forEach((a, i) => {
    s = s.replace(`{${i}}`, a);
  });
  return s;
}

function appendStageRow(
  ul: MiniElementType,
  st: StageTimelineItem,
  onSelect: (stageId: string) => void,
  nested: boolean,
  l10n: Record<string, string>,
  stageConfidence: Record<string, StageConfidenceView>,
): void {
  const li = new MiniElement('li');
  if (nested) {
    li.classList.add('timeline-auto-child');
  }
  li.dataset.id = st.id;
  li.setAttribute('data-id', st.id);
  if (st.selected) {
    li.classList.add('selected');
  }
  const titleSpan = new MiniElement('span');
  const decisionBadge = st.isDecisionStage
    ? ` [${wMsgFromMap(l10n, 'stagent.webview.exec.badgeDecision')}]`
    : '';
  titleSpan.textContent = `${statusIcon(st.status)} ${st.title}${decisionBadge}`;
  li.appendChild(titleSpan);
  const conf = stageConfidence[st.id];
  if (conf && typeof conf.score === 'number' && !Number.isNaN(conf.score)) {
    const confSpan = new MiniElement('span');
    confSpan.className = `confidence conf-${conf.level || 'medium'}`;
    confSpan.textContent = confidenceLabel({
      score: conf.score,
      level: conf.level || 'medium',
      reasons: conf.reasons || [],
    });
    li.appendChild(confSpan);
  }
  li.onclick = () => onSelect(st.id);
  ul.appendChild(li);
}

function appendSegmentFold(
  parentUl: MiniElementType,
  opts: {
    segmentKey: string;
    stages: StageTimelineItem[];
    open: boolean;
    onToggle: (open: boolean) => void;
    onSelect: (stageId: string) => void;
    l10n: Record<string, string>;
    stageConfidence: Record<string, StageConfidenceView>;
  },
): void {
  const wrap = new MiniElement('li');
  wrap.className = 'timeline-auto-fold';
  if (timelineFoldNeedsAttention(opts.stages)) {
    wrap.classList.add('timeline-auto-fold-attn');
  }
  const details = new MiniElement('details');
  details.open = opts.open;
  details.onclick = () => {};
  const summary = new MiniElement('summary');
  summary.textContent = wMsgFromMap(
    opts.l10n,
    'stagent.webview.exec.autoFoldSegment',
    String(opts.stages.length),
  );
  details.appendChild(summary);
  const childUl = new MiniElement('ul');
  childUl.className = 'timeline-auto-children';
  for (const st of opts.stages) {
    appendStageRow(childUl, st, opts.onSelect, true, opts.l10n, opts.stageConfidence);
  }
  details.appendChild(childUl);
  wrap.appendChild(details);
  parentUl.appendChild(wrap);
}

export function createMountStageTimelineMiniDom(
  l10n: Record<string, string>,
  getFold: () => ExecTimelineFoldState,
  getStageConfidence: () => Record<string, StageConfidenceView>,
): (container: MiniElementType, props: TimelineMountProps) => void {
  return (container, props) => {
    container.innerHTML = '';
    container.className = 'timeline-exec';
    const fold = getFold();
    const stageConfidence = getStageConfidence();
    const viewStageId = props.viewStageId ?? null;
    const nodes = buildExecTimelineNodes(props.stages);
    for (const node of nodes) {
      if (node.type === 'decision') {
        appendStageRow(container, node.stage, props.onSelect, false, l10n, stageConfidence);
        continue;
      }
      const open = shouldExpandSegmentFold(fold, node.segmentKey, viewStageId, node.stages);
      appendSegmentFold(container, {
        segmentKey: node.segmentKey,
        stages: node.stages,
        open,
        onToggle: (next) => {
          fold.segmentExpandedByKey[node.segmentKey] = next;
        },
        onSelect: props.onSelect,
        l10n,
        stageConfidence,
      });
    }
  };
}
