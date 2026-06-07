import { applyI18nToDom } from '../l10n/applyI18n';
import { wMsg } from '../l10n/wMsg';
import { escapeHtml } from '../shared/escapeHtml';
import type { StagentAiControlsState } from '../../StagentAiControlsProvider';
import {
  SIDEBAR_MSG_OPEN_SETTINGS,
  SIDEBAR_MSG_READY,
  SIDEBAR_MSG_REFRESH,
  SIDEBAR_MSG_RETRY,
  SIDEBAR_MSG_SET_MODEL,
  SIDEBAR_MSG_SET_PROFILE,
  SIDEBAR_MSG_UPDATE_STATE,
} from '../../workflow/SidebarMessageTypes';

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };

const vscode = acquireVsCodeApi();

const PROFILE_IDS = ['default', 'strict', 'relaxed', 'minimal'] as const;
const PROFILE_LABEL_KEY: Record<(typeof PROFILE_IDS)[number], string> = {
  default: 'stagent.webview.sidebar.profileDefault',
  strict: 'stagent.webview.sidebar.profileStrict',
  relaxed: 'stagent.webview.sidebar.profileRelaxed',
  minimal: 'stagent.webview.sidebar.profileMinimal',
};

const STATUS_LABEL: Record<string, string> = {
  idle: wMsg('stagent.webview.sidebar.statusIdle'),
  running: wMsg('stagent.webview.sidebar.statusRunning'),
  paused: wMsg('stagent.webview.sidebar.statusPaused'),
  pending: wMsg('stagent.webview.sidebar.statusPending'),
  completed: wMsg('stagent.webview.sidebar.statusCompleted'),
  error: wMsg('stagent.webview.sidebar.statusError'),
  done: wMsg('stagent.webview.sidebar.statusDone'),
  skipped: wMsg('stagent.webview.sidebar.statusSkipped'),
  retrying: wMsg('stagent.webview.sidebar.statusRetrying'),
};

function profileOptionLabel(id: (typeof PROFILE_IDS)[number]): string {
  return wMsg(PROFILE_LABEL_KEY[id]);
}

function syncProfileSelect(profileSel: HTMLSelectElement, current: string): void {
  const selected = current || 'default';
  if (profileSel.options.length !== PROFILE_IDS.length) {
    profileSel.innerHTML = PROFILE_IDS.map(
      (id) => `<option value="${id}">${escapeHtml(profileOptionLabel(id))}</option>`,
    ).join('');
  } else {
    PROFILE_IDS.forEach((id, i) => {
      profileSel.options[i]!.textContent = profileOptionLabel(id);
    });
  }
  profileSel.value = selected;
}

function resolveSettingsQuery(state: StagentAiControlsState): string {
  const { copilot, apiKey } = state.envStatus;
  const sb = state.sandboxStatus;
  if (!copilot && !apiKey) {
    return 'stagent.llmApiKey';
  }
  if (sb?.enabled && !sb.enforced) {
    return 'stagent.sandbox.enabled';
  }
  return 'stagent';
}

function envBadgeClass(ok: boolean, hasFallback: boolean): string {
  if (ok) {
    return 'env-badge ok';
  }
  return hasFallback ? 'env-badge' : 'env-badge err';
}

function openSettings(query: string): void {
  vscode.postMessage({ type: SIDEBAR_MSG_OPEN_SETTINGS, query });
}

function bindEnvRowActions(): void {
  document.querySelectorAll('.env-row-action').forEach((row) => {
    const el = row as HTMLElement;
    const query = el.dataset.settingsQuery;
    if (!query) {
      return;
    }
    const titleKey = el.getAttribute('data-i18n-title-key');
    if (titleKey) {
      el.title = wMsg(titleKey);
    }
    const activate = () => openSettings(query);
    el.addEventListener('click', activate);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate();
      }
    });
  });
}

function render(state: StagentAiControlsState): void {
  const profileSel = document.getElementById('profileSelect') as HTMLSelectElement;
  if (profileSel) {
    syncProfileSelect(profileSel, state.settingsProfile || 'default');
  }
  const highlightsEl = document.getElementById('profileHighlights');
  if (highlightsEl) {
    highlightsEl.innerHTML = (state.profileHighlights ?? [])
      .map((line) => `<li>${escapeHtml(line)}</li>`)
      .join('');
  }
  const sel = document.getElementById('modelSelect') as HTMLSelectElement;
  sel.innerHTML =
    `<option value="">${wMsg('stagent.webview.sidebar.autoSelect')}</option>` +
    state.models
      .map(
        (m) =>
          `<option value="${escapeHtml(m.id)}"${m.id === state.preferredModel ? ' selected' : ''}>${escapeHtml(m.name)}</option>`,
      )
      .join('');
  const stageArea = document.getElementById('stageArea')!;
  const btnRetry = document.getElementById('btnRetry') as HTMLButtonElement;
  const retrySel = document.getElementById('retryStageSelect') as HTMLSelectElement;
  const retryOptions = state.retryStageOptions ?? [];
  if (retryOptions.length > 0) {
    const defaultId = state.stageInfo?.stageId ?? retryOptions[0]!.stageId;
    retrySel.innerHTML = retryOptions
      .map((opt) => {
        const label = wMsg(
          'stagent.webview.sidebar.retryStageOption',
          opt.stageName,
          STATUS_LABEL[opt.status] ?? opt.status,
        );
        const selected = opt.stageId === defaultId ? ' selected' : '';
        return `<option value="${escapeHtml(opt.stageId)}"${selected}>${escapeHtml(label)}</option>`;
      })
      .join('');
    retrySel.disabled = false;
    btnRetry.disabled = false;
  } else {
    retrySel.innerHTML = `<option value="">${wMsg('stagent.webview.sidebar.retryStagePlaceholder')}</option>`;
    retrySel.disabled = true;
    btnRetry.disabled = true;
  }
  if (state.stageInfo) {
    const total = state.stageInfo.stageTotal;
    const done = state.stageInfo.completedStages ?? 0;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    stageArea.innerHTML =
      '<div class="stage-card">' +
      `<div class="stage-title" title="${escapeHtml(state.stageInfo.instanceTitle)}">${escapeHtml(state.stageInfo.instanceTitle)}</div>` +
      '<div class="stage-sub">' +
      wMsg('stagent.webview.sidebar.stageProgress', state.stageInfo.stageIndex, total) +
      `${escapeHtml(state.stageInfo.stageName)} · ${STATUS_LABEL[state.stageInfo.status] ?? state.stageInfo.status}` +
      '</div>' +
      `<div class="progress-track" title="${wMsg('stagent.webview.sidebar.progressTrackTitle')}"><div class="progress-fill" style="width:${pct}%"></div></div>` +
      `<div class="progress-caption">${wMsg('stagent.webview.sidebar.stagesCompleted', done, total)}</div>` +
      '</div>';
  } else {
    stageArea.innerHTML = `<div class="no-stage">${wMsg('stagent.webview.sidebar.noActiveWorkflow')}</div>`;
  }
  const hasCopilot = state.envStatus.copilot;
  const hasApi = state.envStatus.apiKey;
  const hasAnyLlm = hasCopilot || hasApi;
  const copilotBadge = document.getElementById('copilotBadge')!;
  const apiBadge = document.getElementById('apiBadge')!;
  const llmDetail = document.getElementById('llmDetail')!;
  copilotBadge.textContent = hasCopilot
    ? wMsg('stagent.webview.sidebar.copilotAvailable')
    : wMsg('stagent.webview.sidebar.copilotUnavailable');
  copilotBadge.className = envBadgeClass(hasCopilot, hasApi);
  apiBadge.textContent = hasApi
    ? wMsg('stagent.webview.sidebar.apiConfigured')
    : wMsg('stagent.webview.sidebar.apiNotConfigured');
  apiBadge.className = envBadgeClass(hasApi, hasCopilot);
  const sandboxBadge = document.getElementById('sandboxBadge')!;
  const sb = state.sandboxStatus;
  if (!sb?.enabled) {
    sandboxBadge.textContent = wMsg('stagent.webview.sidebar.sandboxDisabled');
    sandboxBadge.className = 'env-badge';
    sandboxBadge.removeAttribute('title');
  } else if (sb.enforced) {
    sandboxBadge.textContent = wMsg('stagent.webview.sidebar.sandboxEnforced');
    sandboxBadge.className = 'env-badge ok';
    sandboxBadge.title = sb.detail || '';
  } else {
    sandboxBadge.textContent = wMsg('stagent.webview.sidebar.sandboxSoftOnly', sb.platform);
    sandboxBadge.className = 'env-badge warn';
    sandboxBadge.title = sb.detail || '';
  }
  const detailLines: string[] = [];
  if (!hasAnyLlm) {
    detailLines.push(wMsg('stagent.webview.sidebar.noLlmHint'));
  } else if (hasApi) {
    detailLines.push(`${state.envStatus.llmBaseUrl} / ${state.envStatus.llmModel}`);
  }
  if (sb?.enabled && sb.detail) {
    detailLines.push(sb.detail);
  }
  llmDetail.textContent = detailLines.join('\n');
  const btnSettings = document.getElementById('btnSettings') as HTMLButtonElement | null;
  if (btnSettings) {
    btnSettings.dataset.settingsQuery = resolveSettingsQuery(state);
  }
}

document.getElementById('profileSelect')?.addEventListener('change', (e) => {
  vscode.postMessage({
    type: SIDEBAR_MSG_SET_PROFILE,
    profileId: (e.target as HTMLSelectElement).value,
  });
});
document.getElementById('modelSelect')!.addEventListener('change', (e) => {
  vscode.postMessage({ type: SIDEBAR_MSG_SET_MODEL, modelId: (e.target as HTMLSelectElement).value });
});
document.getElementById('btnRetry')!.addEventListener('click', () => {
  const sel = document.getElementById('retryStageSelect') as HTMLSelectElement;
  const stageId = sel?.value?.trim();
  if (!stageId) {
    return;
  }
  vscode.postMessage({ type: SIDEBAR_MSG_RETRY, stageId });
});
document.getElementById('btnRefresh')!.addEventListener('click', () => {
  vscode.postMessage({ type: SIDEBAR_MSG_REFRESH });
});
document.getElementById('btnSettings')!.addEventListener('click', () => {
  const btn = document.getElementById('btnSettings') as HTMLButtonElement;
  openSettings(btn.dataset.settingsQuery || 'stagent');
});

window.addEventListener('message', (e: MessageEvent) => {
  const msg = e.data as { type?: string; state?: StagentAiControlsState };
  if (msg.type === SIDEBAR_MSG_UPDATE_STATE && msg.state) {
    render(msg.state);
  }
});

const initialProfileSel = document.getElementById('profileSelect') as HTMLSelectElement | null;
if (initialProfileSel) {
  syncProfileSelect(initialProfileSel, 'default');
}
bindEnvRowActions();
applyI18nToDom();
vscode.postMessage({ type: SIDEBAR_MSG_READY });
