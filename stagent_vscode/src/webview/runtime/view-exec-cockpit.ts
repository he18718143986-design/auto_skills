import type { EngineActivityKind, StageExecSemantic } from '../../workflow-types/MessageTypes';
import { wMsg } from '../l10n/wMsg';
import { buildSliceHealthRows } from '../shared/sliceHealthModel';
import { confirmStore, execStore } from './stores';

const MAX_FEED_ITEMS = 40;

export interface EngineActivityEntry {
  kind: EngineActivityKind;
  text: string;
  stageId?: string;
  timestamp?: string;
}

export function pushEngineActivity(entry: EngineActivityEntry): void {
  execStore.engineActivityFeed.push(entry);
  if (execStore.engineActivityFeed.length > MAX_FEED_ITEMS) {
    execStore.engineActivityFeed.splice(0, execStore.engineActivityFeed.length - MAX_FEED_ITEMS);
  }
}

export function setStageExecSemantic(stageId: string, semantic: StageExecSemantic | null | undefined): void {
  if (!semantic) {
    delete execStore.stageExecSemantic[stageId];
  } else {
    execStore.stageExecSemantic[stageId] = semantic;
  }
  execStore.selfHealActive = Object.keys(execStore.stageExecSemantic).length > 0;
}

function kindLabel(kind: EngineActivityKind): string {
  const map: Record<EngineActivityKind, string> = {
    gate: 'gate',
    replan: 'replan',
    preflight: 'preflight',
    verify: 'verify',
    fix: 'fix',
    engine: 'engine',
  };
  return map[kind] ?? kind;
}

function formatTime(iso?: string): string {
  if (!iso) {
    return '';
  }
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '';
  }
}

export function renderEngineActivityFeed(): void {
  const el = document.getElementById('engine-activity-feed');
  if (!el) {
    return;
  }
  el.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'cockpit-feed-head';
  head.textContent = wMsg('stagent.webview.cockpit.engineFeedTitle');
  el.appendChild(head);

  const list = document.createElement('div');
  list.className = 'cockpit-feed-list';
  const items = execStore.engineActivityFeed;
  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'muted cockpit-feed-empty';
    empty.textContent = wMsg('stagent.webview.cockpit.engineFeedEmpty');
    list.appendChild(empty);
  } else {
    for (const item of items) {
      const row = document.createElement('div');
      row.className = 'cockpit-feed-row';
      const time = document.createElement('span');
      time.className = 'cockpit-feed-time muted';
      time.textContent = formatTime(item.timestamp);
      const badge = document.createElement('span');
      badge.className = `cockpit-feed-kind cockpit-kind-${item.kind}`;
      badge.textContent = kindLabel(item.kind);
      const text = document.createElement('span');
      text.className = 'cockpit-feed-text';
      text.textContent = item.text;
      row.appendChild(time);
      row.appendChild(badge);
      row.appendChild(text);
      list.appendChild(row);
    }
  }
  el.appendChild(list);
}

function statusPillClass(status: string, semantic?: StageExecSemantic): string {
  if (semantic === 'deferred') {
    return 'cockpit-pill-deferred';
  }
  if (semantic === 'self-healing') {
    return 'cockpit-pill-healing';
  }
  if (status === 'done') {
    return 'cockpit-pill-done';
  }
  if (status === 'running' || status === 'retrying') {
    return 'cockpit-pill-running';
  }
  if (status === 'error') {
    return 'cockpit-pill-error';
  }
  return 'cockpit-pill-pending';
}

export function renderSliceHealthPanel(): void {
  const el = document.getElementById('slice-health-panel');
  if (!el) {
    return;
  }
  el.innerHTML = '';
  const head = document.createElement('strong');
  head.textContent = wMsg('stagent.webview.cockpit.sliceHealthTitle');
  el.appendChild(head);

  const stages = (confirmStore.workflowDef?.stages ?? []) as Array<{ id: string; isDecisionStage?: boolean }>;
  const rows = buildSliceHealthRows(stages, execStore.stageMaps.stageStatus, execStore.stageExecSemantic);
  if (rows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'muted';
    empty.style.fontSize = '0.82rem';
    empty.textContent = wMsg('stagent.webview.cockpit.sliceHealthEmpty');
    el.appendChild(empty);
    return;
  }

  for (const row of rows) {
    const card = document.createElement('div');
    card.className = 'slice-health-card';
    const title = document.createElement('div');
    title.className = 'slice-health-key';
    title.textContent = row.semanticKey;
    card.appendChild(title);
    const pills = document.createElement('div');
    pills.className = 'slice-health-pills';
    const addPill = (label: string, status: string, semantic?: StageExecSemantic) => {
      const span = document.createElement('span');
      span.className = `slice-health-pill ${statusPillClass(status, semantic)}`;
      const display =
        semantic === 'deferred'
          ? `${label} deferred`
          : semantic === 'self-healing'
            ? `${label} …`
            : `${label} ${status}`;
      span.textContent = display;
      pills.appendChild(span);
    };
    addPill('impl', row.implStatus);
    addPill('test', row.testRunStatus, row.testRunSemantic);
    addPill('fix', row.fixStatus);
    card.appendChild(pills);
    el.appendChild(card);
  }
}

export function renderDeferredCallout(): void {
  const el = document.getElementById('exec-deferred-callout');
  if (!el) {
    return;
  }
  const deferredIds = Object.entries(execStore.stageExecSemantic).filter(([, v]) => v === 'deferred');
  if (!execStore.selfHealActive || deferredIds.length === 0) {
    el.hidden = true;
    el.style.display = 'none';
    el.textContent = '';
    return;
  }
  el.hidden = false;
  el.style.display = 'block';
  el.className = 'exec-deferred-callout';
  el.textContent = wMsg('stagent.webview.cockpit.deferredCallout');
}

export function renderExecCockpit(): void {
  renderEngineActivityFeed();
  renderSliceHealthPanel();
  renderDeferredCallout();
}

export function resetExecCockpit(): void {
  execStore.engineActivityFeed = [];
  execStore.stageExecSemantic = {};
  execStore.selfHealActive = false;
  execStore.qualityReport = null;
}
