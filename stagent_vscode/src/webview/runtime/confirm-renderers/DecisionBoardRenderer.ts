import { wMsg } from '../../l10n/wMsg';
import { confirmStore } from '../stores';
import { escapeHtml, setConfirmSectionVisible } from '../shell';
import type { DecisionBoardItemView } from '../stores/types';

function provenanceBadge(provenance: string, ruleRefs: number[]): string {
  const refs = ruleRefs.length > 0 ? ' · R#' + ruleRefs.join(',R#') : '';
  const key = 'stagent.webview.confirm.decisionProvenance.' + provenance;
  const label = wMsg(key);
  const text = label !== key ? label : provenance;
  return '<span class="decision-provenance-badge" data-provenance="' + escapeHtml(provenance) + '">' + escapeHtml(text + refs) + '</span>';
}

function kindBadge(kind: string): string {
  const key = 'stagent.webview.confirm.decisionKind.' + kind;
  const label = wMsg(key);
  const text = label !== key ? label : kind;
  return '<span class="decision-kind-badge decision-kind-' + escapeHtml(kind) + '">' + escapeHtml(text) + '</span>';
}

function initResolutionsFromBoard(): void {
  if (!confirmStore.decisionBoard) {
    confirmStore.decisionResolutions = {};
    return;
  }
  const next: Record<string, { decisionRecord: string; provenance: string; resolved: boolean }> = {};
  for (const item of confirmStore.decisionBoard.items) {
    const proposal = (item.proposal ?? '').trim();
    next[item.stageId] = {
      decisionRecord: proposal,
      provenance: item.provenance,
      resolved: !item.requiresUser,
    };
  }
  confirmStore.decisionResolutions = next;
}

function pendingCount(): number {
  if (!confirmStore.decisionBoard) {
    return 0;
  }
  return confirmStore.decisionBoard.items.filter((item) => {
    const res = confirmStore.decisionResolutions[item.stageId];
    return item.requiresUser && (!res || !res.resolved);
  }).length;
}

export function syncDecisionStartGate(): void {
  const btn = document.getElementById('btn-start') as HTMLButtonElement | null;
  if (!btn) {
    return;
  }
  const blocked = confirmStore.planBlocked;
  const frontloaded = confirmStore.decisionMode === 'frontloaded';
  const pending = frontloaded ? pendingCount() : 0;
  btn.disabled = blocked || pending > 0;
  const approveKey = 'stagent.webview.main.approveAllAndStart';
  const startKey = 'stagent.webview.main.startExecution';
  if (frontloaded && confirmStore.decisionBoard && confirmStore.decisionBoard.summary.total > 0) {
    btn.textContent = wMsg(approveKey);
  } else {
    btn.textContent = wMsg(startKey);
  }
  const hint = document.getElementById('decision-board-hint');
  if (hint && confirmStore.decisionBoard && frontloaded) {
    const s = confirmStore.decisionBoard.summary;
    hint.textContent = wMsg(
      'stagent.webview.confirm.decisionBoardGateHint',
      s.total,
      s.auto,
      pending,
    );
  } else if (hint) {
    hint.textContent = '';
  }
}

function renderItem(item: DecisionBoardItemView): string {
  const res = confirmStore.decisionResolutions[item.stageId];
  const record = res?.decisionRecord ?? item.proposal ?? '';
  const resolved = !!res?.resolved;
  let html =
    '<div class="decision-board-item' +
    (resolved ? ' resolved' : '') +
    '" data-stage-id="' +
    escapeHtml(item.stageId) +
    '">';
  html += '<div class="decision-board-item-head">';
  html += '<span class="decision-board-title">' + escapeHtml(item.stageTitle) + '</span>';
  html += '<span class="decision-board-stage-id"><code>' + escapeHtml(item.stageId) + '</code></span>';
  html += '</div>';
  html += '<div class="decision-board-badges">' + kindBadge(item.kind) + provenanceBadge(item.provenance, item.ruleRefs) + '</div>';
  if (item.plainSummary) {
    html += '<div class="decision-board-plain-summary">' + escapeHtml(item.plainSummary) + '</div>';
  }
  if (item.reasoning) {
    html += '<div class="decision-board-reasoning muted">' + escapeHtml(item.reasoning) + '</div>';
  }
  if (item.requiresUser) {
    html +=
      '<textarea class="decision-board-edit" data-stage-id="' +
      escapeHtml(item.stageId) +
      '" rows="3">' +
      escapeHtml(record) +
      '</textarea>';
    html +=
      '<button type="button" class="secondary decision-board-confirm-btn" data-stage-id="' +
      escapeHtml(item.stageId) +
      '">' +
      escapeHtml(wMsg('stagent.webview.confirm.decisionConfirmItem')) +
      '</button>';
  } else {
    html += '<div class="decision-board-proposal">' + escapeHtml(record || wMsg('stagent.webview.confirm.decisionNoProposal')) + '</div>';
  }
  html += '</div>';
  return html;
}

function bindDecisionBoardEvents(): void {
  const root = document.getElementById('decision-board-list');
  if (!root) {
    return;
  }
  root.querySelectorAll('.decision-board-edit').forEach((el) => {
    const ta = el as HTMLTextAreaElement;
    const stageId = ta.getAttribute('data-stage-id');
    if (!stageId) {
      return;
    }
    ta.addEventListener('input', () => {
      const res = confirmStore.decisionResolutions[stageId];
      if (res) {
        res.decisionRecord = ta.value;
        res.resolved = false;
        syncDecisionStartGate();
        renderDecisionBoard();
      }
    });
  });
  root.querySelectorAll('.decision-board-confirm-btn').forEach((el) => {
    el.addEventListener('click', () => {
      const stageId = el.getAttribute('data-stage-id');
      if (!stageId) {
        return;
      }
      const ta = root.querySelector('.decision-board-edit[data-stage-id="' + stageId.replace(/"/g, '') + '"]') as HTMLTextAreaElement | null;
      const res = confirmStore.decisionResolutions[stageId];
      if (!res) {
        return;
      }
      res.decisionRecord = (ta?.value ?? res.decisionRecord).trim();
      res.provenance = 'human';
      res.resolved = res.decisionRecord.length > 0;
      syncDecisionStartGate();
      renderDecisionBoard();
    });
  });
}

export function buildFrontloadResolutionsForStart(): Array<{
  stageId: string;
  decisionRecord: string;
  provenance: string;
}> {
  if (confirmStore.decisionMode !== 'frontloaded' || !confirmStore.decisionBoard) {
    return [];
  }
  const out: Array<{ stageId: string; decisionRecord: string; provenance: string }> = [];
  for (const item of confirmStore.decisionBoard.items) {
    const res = confirmStore.decisionResolutions[item.stageId];
    const record = (res?.decisionRecord ?? item.proposal ?? '').trim();
    if (!record) {
      continue;
    }
    out.push({
      stageId: item.stageId,
      decisionRecord: record,
      provenance: res?.provenance ?? item.provenance,
    });
  }
  return out;
}

export function applyDecisionBoardFromMessage(msg: {
  decisionBoard?: { items: DecisionBoardItemView[]; summary: { total: number; auto: number; needsReview: number } };
  decisionMode?: 'inline-pause' | 'frontloaded';
}): void {
  confirmStore.decisionBoard = msg.decisionBoard ?? null;
  confirmStore.decisionMode = msg.decisionMode === 'frontloaded' ? 'frontloaded' : 'inline-pause';
  initResolutionsFromBoard();
}

export function renderDecisionBoard(): void {
  const section = document.getElementById('section-decision-board');
  const summaryEl = document.getElementById('decision-board-summary');
  const listEl = document.getElementById('decision-board-list');
  if (!section || !summaryEl || !listEl) {
    return;
  }
  if (!confirmStore.decisionBoard || confirmStore.decisionBoard.items.length === 0) {
    listEl.innerHTML = '';
    summaryEl.textContent = '';
    setConfirmSectionVisible('section-decision-board', false);
    syncDecisionStartGate();
    return;
  }
  const s = confirmStore.decisionBoard.summary;
  summaryEl.textContent = wMsg(
    'stagent.webview.confirm.decisionBoardSummary',
    s.total,
    s.auto,
    s.needsReview,
    pendingCount(),
  );
  listEl.innerHTML = confirmStore.decisionBoard.items.map(renderItem).join('');
  setConfirmSectionVisible('section-decision-board', true);
  bindDecisionBoardEvents();
  syncDecisionStartGate();
}
