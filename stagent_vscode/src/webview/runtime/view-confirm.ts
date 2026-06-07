import { wMsg } from '../l10n/wMsg';
import { CONFIRM_AITIP_MAX_CHARS } from '../../UiListLimits';
import { confirmStore, DEFAULT_TASK_TYPE } from './stores';
import { vscode } from './vscode-api';

import { escapeHtml, setConfirmSectionVisible } from './shell';
import { show } from './shell';

export function selectConfirmStage(stageId) {
  confirmStore.selectedStageId = stageId;
  const ul = document.getElementById('timeline');
  [...ul.children].forEach((c) => c.classList.toggle('selected', c.dataset.id === stageId));
  document.querySelectorAll('.plan-stage-card').forEach((c) => {
    c.classList.toggle('selected', c.dataset.stageId === stageId);
  });
  const card = document.querySelector('.plan-stage-card[data-stage-id="' + stageId.replace(/"/g, '') + '"]');
  if (card && card.scrollIntoView) {
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  showConfirmDetail();
}

export function renderConfirmFooter() {
  const el = document.getElementById('confirm-stats');
  if (!confirmStore.workflowDef || !confirmStore.workflowDef.stages) {
    el.innerHTML = '';
    return;
  }
  const counts = countStagesByKind(confirmStore.workflowDef.stages);
  const lines = buildConfirmStatsLines({
    taskType: confirmStore.workflowDef.meta?.taskType,
    ...counts,
  });
  el.innerHTML = lines.map((line) => '<span>' + escapeHtml(line) + '</span>').join('');
}

export function renderPlanArtifactsPanel() {
  const el = document.getElementById('plan-artifacts');
  const section = document.getElementById('section-plan-artifacts');
  const summary = section ? section.querySelector('summary') : null;
  if (!confirmStore.workflowDef || !confirmStore.workflowDef.stages) {
    el.innerHTML = '';
    setConfirmSectionVisible('section-plan-artifacts', false);
    return;
  }
  const paths = collectArtifactPathsFromStages(confirmStore.workflowDef.stages);
  if (paths.length === 0) {
    el.innerHTML = '';
    setConfirmSectionVisible('section-plan-artifacts', false);
    return;
  }
  if (summary) {
    summary.textContent = wMsg('stagent.webview.confirm.artifactPathsSummary', paths.length);
  }
  const warnings = getArtifactHeuristicWarnings(paths, confirmStore.workflowDef.stages);
  let html = '<ul>';
  for (const p of paths) {
    html += '<li><code>' + escapeHtml(p) + '</code></li>';
  }
  html += '</ul>';
  for (const warn of warnings) {
    html += '<div class="artifact-warn">⚠ ' + escapeHtml(warn) + '</div>';
  }
  el.innerHTML = html;
  setConfirmSectionVisible('section-plan-artifacts', true);
}

export function renderPlanDagGraph() {
  const el = document.getElementById('plan-dag-graph');
  if (!el || !confirmStore.workflowDef || !confirmStore.workflowDef.stages) {
    setConfirmSectionVisible('section-plan-dag', false);
    return;
  }
  const html = buildWorkflowDagGraphHtml(confirmStore.workflowDef.stages, confirmStore.workflowDef.globalConfig, escapeHtml, {
    onNodeClickStageId: true,
  });
  if (!html) {
    el.innerHTML = '';
    setConfirmSectionVisible('section-plan-dag', false);
    return;
  }
  el.innerHTML = html;
  setConfirmSectionVisible('section-plan-dag', true);
  el.querySelectorAll('.dag-node-clickable').forEach((node) => {
    const sid = node.getAttribute('data-stage-id');
    if (!sid) {
      return;
    }
    node.addEventListener('click', () => selectConfirmStage(sid));
    node.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        selectConfirmStage(sid);
      }
    });
    node.setAttribute('tabindex', '0');
    node.setAttribute('role', 'button');
  });
}

export function renderPlanStageCards() {
  const container = document.getElementById('plan-stage-cards');
  container.innerHTML = '';
  if (!confirmStore.workflowDef || !confirmStore.workflowDef.stages || confirmStore.workflowDef.stages.length === 0) {
    return;
  }
  const phaseMap = {};
  const phaseOrder = [];
  confirmStore.workflowDef.stages.forEach((s, i) => {
    const phase = parsePhaseFromTitle(s.title) || '';
    if (!phaseMap[phase]) {
      phaseMap[phase] = [];
      phaseOrder.push(phase);
    }
    phaseMap[phase].push({ s, i });
  });
  const hasPhases = phaseOrder.some((p) => p !== '');
  let html = '';
  for (const phase of phaseOrder) {
    if (hasPhases && phase) {
      html += '<div class="plan-phase-header">' + escapeHtml(phase) + '</div>';
    }
    for (const { s } of phaseMap[phase]) {
      const displayTitle = stripPhasePrefix(s.title);
      const artifactPath = getStageArtifactPath(s);
      const tags = ['<span class="tag">' + escapeHtml(s.tool) + '</span>'];
      if (s.isDecisionStage) {
        tags.push('<span class="tag decision">' + wMsg('stagent.webview.confirm.tagDecision') + '</span>');
      }
      if (s.pauseAfter) {
        tags.push('<span class="tag pause">' + wMsg('stagent.webview.confirm.tagPause') + '</span>');
      }
      const desc = s.description ? String(s.description) : '';
      if (s.id.includes('stagent_') || desc.includes('[系统插入 · M40]')) {
        tags.push('<span class="tag repair">' + wMsg('stagent.webview.confirm.tagRepairM40') + '</span>');
      }
      let cardHtml =
        '<div class="plan-stage-card' +
        (s.id === confirmStore.selectedStageId ? ' selected' : '') +
        '" data-stage-id="' +
        escapeHtml(s.id) +
        '" role="button" tabindex="0">' +
        '<div class="card-title">' +
        escapeHtml(displayTitle) +
        '</div>' +
        '<div class="card-tags">' +
        tags.join('') +
        '</div>';
      if (artifactPath) {
        cardHtml += '<div class="artifact-line">📄 ' + escapeHtml(artifactPath) + '</div>';
      }
      if (s.aiTip && String(s.aiTip).trim()) {
        cardHtml +=
          '<div class="card-aitip">💡 ' + escapeHtml(truncateConfirmText(String(s.aiTip), CONFIRM_AITIP_MAX_CHARS)) + '</div>';
      }
      cardHtml += '</div>';
      html += cardHtml;
    }
  }
  container.innerHTML = html;
  container.querySelectorAll('.plan-stage-card').forEach((card) => {
    const sid = card.getAttribute('data-stage-id');
    if (!sid) {
      return;
    }
    card.addEventListener('click', () => selectConfirmStage(sid));
    card.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        selectConfirmStage(sid);
      }
    });
  });
}

export function renderConfirmTimeline() {
  const ul = document.getElementById('timeline');
  ul.innerHTML = '';
  for (const st of confirmStore.workflowDef.stages) {
    const li = document.createElement('li');
    li.textContent = stripPhasePrefix(st.title);
    const badge = document.createElement('span');
    badge.className = 'badge decision';
    badge.textContent = st.isDecisionStage ? wMsg('stagent.webview.confirm.tagDecision') : '';
    li.appendChild(badge);
    li.dataset.id = st.id;
    if (st.id === confirmStore.selectedStageId) li.classList.add('selected');
    li.onclick = () => selectConfirmStage(st.id);
    ul.appendChild(li);
  }
}

export function showConfirmDetail() {
  const st = confirmStore.workflowDef.stages.find((x) => x.id === confirmStore.selectedStageId);
  const el = document.getElementById('detail');
  if (!st) return (el.textContent = '');
  const lines = [];
  if (st.aiTip && String(st.aiTip).trim()) {
    lines.push(wMsg('stagent.webview.confirm.reviewHint', String(st.aiTip).trim()));
  }
  lines.push(st.description || wMsg('stagent.webview.confirm.noDescription'), wMsg('stagent.webview.confirm.toolLabel', st.tool), wMsg('stagent.webview.confirm.pauseAfterLabel', String(st.pauseAfter)));
  const artifactPath = getStageArtifactPath(st);
  if (artifactPath) {
    lines.push(wMsg('stagent.webview.confirm.artifactPathLabel', artifactPath));
  }
  if (confirmStore.workflowDef.meta?.taskType) {
    lines.push(wMsg('stagent.webview.confirm.taskTypeLabel', confirmStore.workflowDef.meta.taskType));
  }
  if (confirmStore.settingsProfile) {
    lines.push(wMsg('stagent.webview.confirm.profileHeader'), wMsg('stagent.webview.confirm.currentProfile', confirmStore.settingsProfile));
    if (confirmStore.profileGateDiff && confirmStore.profileGateDiff.length) {
      lines.push(wMsg('stagent.webview.confirm.profileGateDiff'), ...confirmStore.profileGateDiff);
    }
  }
  if (confirmStore.experienceReferencesUsed > 0) {
    lines.push(wMsg('stagent.webview.confirm.experienceRefsDetail', confirmStore.experienceReferencesUsed));
  }
  lines.push(...formatGlobalConfigSummaryForConfirm(confirmStore.workflowDef.globalConfig));
  if (confirmStore.stageSourceSummary && confirmStore.stageSourceSummary.length) {
    lines.push(...formatStageSourceSummaryLines(confirmStore.stageSourceSummary, st.id));
  }
  el.textContent = lines.join('\n');
}


export function registerConfirmView(): void {
  document.getElementById('btn-back-input')!.onclick = () => {
    show('input');
    (document.getElementById('user-input') as HTMLTextAreaElement).focus();
  };
}
