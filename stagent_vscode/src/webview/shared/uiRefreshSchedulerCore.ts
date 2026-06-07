/** Pause bar visibility snapshot passed through refresh context. */
export interface UiRefreshPauseBarState {
  showPauseBar?: boolean;
}

export type UiRefreshTarget =
  | 'timeline'
  | 'dagGraph'
  | 'pauseBar'
  | 'pauseBarVisibility'
  | 'outputVisibility'
  | 'outputPanel';

export interface UiRefreshContext {
  pauseBar?: { stageId: string; uiState: UiRefreshPauseBarState };
  outputPanel?: { stageId?: string | null };
  dagGraphSelect?: (sid: string) => void;
}

export type UiRefreshDeps = {
  syncPauseBarVisibility: () => unknown;
  syncOutputVisibility: () => void;
  renderExecTimeline: () => void;
  renderExecDagGraph: (onNodeClick: (stageId: string) => void) => void;
  renderPauseBarFromStore: () => void;
  renderPauseBar: (stageId: string, uiState: UiRefreshPauseBarState) => void;
  refreshExecOutputPanel: (stageIdOverride?: string | null) => void;
  selectExecTimelineStage: (stageId: string) => void;
};

let deps: UiRefreshDeps | null = null;
let syncFlushForTest = false;

const pending = new Set<UiRefreshTarget>();
let ctx: UiRefreshContext = {};
let scheduled = false;

export function bindUiRefreshDeps(next: UiRefreshDeps): void {
  deps = next;
}

function resolveDeps(): UiRefreshDeps {
  if (!deps) {
    throw new Error('[Stagent webview] uiRefreshScheduler deps not bound');
  }
  return deps;
}

/**
 * 合并同帧多次 scheduleUiRefresh 传入的 context。
 * 各字段独立：若本次调用显式提供则 last-write-wins；未提供则保留先前值。
 * （同一帧两个 handler 写不同 pauseBar.stageId 时，以后一次为准。）
 */
function mergeContext(next?: UiRefreshContext): void {
  if (!next) {
    return;
  }
  if (next.pauseBar !== undefined) {
    ctx.pauseBar = next.pauseBar;
  }
  if (next.outputPanel !== undefined) {
    ctx.outputPanel = next.outputPanel;
  }
  if (next.dagGraphSelect !== undefined) {
    ctx.dagGraphSelect = next.dagGraphSelect;
  }
}

function flushUiRefresh(): void {
  scheduled = false;
  const targets = new Set(pending);
  const snapshot = ctx;
  pending.clear();
  ctx = {};
  const d = resolveDeps();

  if (targets.has('pauseBarVisibility')) {
    d.syncPauseBarVisibility();
  }
  if (targets.has('outputVisibility')) {
    d.syncOutputVisibility();
  }
  if (targets.has('timeline')) {
    d.renderExecTimeline();
  }
  if (targets.has('dagGraph')) {
    const onSelect = snapshot.dagGraphSelect ?? d.selectExecTimelineStage;
    d.renderExecDagGraph(onSelect);
  }
  if (targets.has('pauseBar')) {
    if (snapshot.pauseBar) {
      d.renderPauseBar(snapshot.pauseBar.stageId, snapshot.pauseBar.uiState);
    } else {
      d.renderPauseBarFromStore();
    }
  }
  if (targets.has('outputPanel')) {
    d.refreshExecOutputPanel(snapshot.outputPanel?.stageId);
  }
}

export function scheduleUiRefresh(targets: UiRefreshTarget[], context?: UiRefreshContext): void {
  for (const t of targets) {
    pending.add(t);
  }
  mergeContext(context);
  if (syncFlushForTest) {
    flushUiRefresh();
    return;
  }
  if (scheduled) {
    return;
  }
  scheduled = true;
  const g = globalThis as { requestAnimationFrame?: (cb: () => void) => number };
  if (typeof g.requestAnimationFrame === 'function') {
    g.requestAnimationFrame(flushUiRefresh);
  } else {
    flushUiRefresh();
  }
}

export function flushUiRefreshForTest(): void {
  if (scheduled) {
    scheduled = false;
    flushUiRefresh();
  } else if (pending.size > 0) {
    flushUiRefresh();
  }
}

export function enableSyncUiRefreshForTest(): void {
  syncFlushForTest = true;
}

export function disableSyncUiRefreshForTest(): void {
  syncFlushForTest = false;
}

export function resetUiRefreshSchedulerForTest(): void {
  pending.clear();
  ctx = {};
  scheduled = false;
}

export function setUiRefreshDepsForTest(next: UiRefreshDeps): void {
  deps = next;
}

export function resetUiRefreshDepsForTest(): void {
  deps = null;
}

export function getPendingUiRefreshTargetsForTest(): UiRefreshTarget[] {
  return [...pending];
}
