import { applyI18nToDom } from '../l10n/applyI18n';
import { wMsg } from '../l10n/wMsg';
import { escapeHtml } from '../shared/escapeHtml';
import { formatRelativeTime } from '../shared/formatRelativeTimeZh';
import {
  SIDEBAR_MSG_DELETE_TASK,
  SIDEBAR_MSG_NEW_TASK,
  SIDEBAR_MSG_READY,
  SIDEBAR_MSG_REFRESH,
  SIDEBAR_MSG_RESUME_TASK,
  SIDEBAR_MSG_UPDATE_LIST,
} from '../../workflow/SidebarMessageTypes';

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };

const vscode = acquireVsCodeApi();

const STATUS_LABEL: Record<string, string> = {
  idle: wMsg('stagent.webview.sidebar.taskDraft'),
  running: wMsg('stagent.webview.sidebar.taskRunning'),
  paused: wMsg('stagent.webview.sidebar.taskPaused'),
  completed: wMsg('stagent.webview.sidebar.taskCompleted'),
  error: wMsg('stagent.webview.sidebar.taskFailed'),
};

function resumeLabel(status: string): string {
  switch (status) {
    case 'idle':
      return wMsg('stagent.webview.sidebar.resumeConfirm');
    case 'running':
      return wMsg('stagent.webview.sidebar.resumeExec');
    case 'error':
      return wMsg('stagent.webview.sidebar.resumeProcess');
    default:
      return wMsg('stagent.webview.sidebar.resume');
  }
}

interface TaskListItemMsg {
  instanceKey: string;
  status: string;
  recoverable?: boolean;
  userInput?: string;
  title?: string;
  taskType?: string;
  createdAt?: string;
  stageCount: number;
  completedStages: number;
}

function postNewTask(): void {
  vscode.postMessage({ type: SIDEBAR_MSG_NEW_TASK });
}

function bindTaskItem(el: HTMLElement): void {
  const instanceId = el.dataset.id;
  if (!instanceId) {
    return;
  }
  const openTask = () => {
    vscode.postMessage({ type: SIDEBAR_MSG_RESUME_TASK, instanceId });
  };
  el.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('.btn-delete') || t.closest('.btn-resume')) {
      return;
    }
    openTask();
  });
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') {
      return;
    }
    if ((e.target as HTMLElement).closest('.btn-delete, .btn-resume')) {
      return;
    }
    e.preventDefault();
    openTask();
  });
}

function bindTaskActions(container: HTMLElement): void {
  container.querySelectorAll('.task-item').forEach((el) => bindTaskItem(el as HTMLElement));
  container.querySelectorAll('.btn-resume').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      vscode.postMessage({
        type: SIDEBAR_MSG_RESUME_TASK,
        instanceId: (btn as HTMLElement).dataset.resumeId,
      });
    });
  });
  container.querySelectorAll('.btn-delete').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      vscode.postMessage({
        type: SIDEBAR_MSG_DELETE_TASK,
        instanceId: (btn as HTMLElement).dataset.delId,
      });
    });
  });
}

function render(items: TaskListItemMsg[]): void {
  const container = document.getElementById('taskList')!;
  const empty = document.getElementById('emptyState')!;
  const toolbar = document.getElementById('taskToolbar')!;
  if (!items || items.length === 0) {
    container.innerHTML = '';
    toolbar.hidden = true;
    empty.hidden = false;
    return;
  }
  toolbar.hidden = false;
  empty.hidden = true;
  container.innerHTML = items
    .map((s) => {
      const pct = s.stageCount > 0 ? Math.round((s.completedStages / s.stageCount) * 100) : 0;
      const statusText = STATUS_LABEL[s.status] || s.status;
      const title = s.title ?? s.instanceKey;
      const rowLabel = wMsg('stagent.webview.sidebar.taskOpen', title, statusText);
      const resume = resumeLabel(s.status);
      const resumeBtn = s.recoverable
        ? `<button class="btn-action btn-resume" type="button" title="${escapeHtml(resume)}" aria-label="${escapeHtml(resume)}" data-resume-id="${escapeHtml(s.instanceKey)}">${escapeHtml(wMsg('stagent.webview.sidebar.taskResumeIcon'))}</button>`
        : '';
      const deleteLabel = wMsg('stagent.webview.sidebar.deleteTaskTitle');
      return (
        `<div class="task-item" data-id="${escapeHtml(s.instanceKey)}" role="button" tabindex="0" aria-label="${escapeHtml(rowLabel)}">` +
        `<div class="status-dot ${escapeHtml(s.status)}"></div>` +
        '<div class="task-body">' +
        `<div class="task-title" title="${escapeHtml(s.userInput ?? title)}">${escapeHtml(title)}</div>` +
        '<div class="task-meta">' +
        `<span>${escapeHtml(statusText)}</span>` +
        `<span>${escapeHtml(s.taskType ?? '')}</span>` +
        `<span>${escapeHtml(formatRelativeTime(s.createdAt))}</span>` +
        '</div>' +
        `<div class="progress-bar" style="width:${pct}%"></div>` +
        '</div>' +
        '<div class="task-aside">' +
        `<span class="task-progress">${s.completedStages}/${s.stageCount}</span>` +
        `<div class="task-actions">${resumeBtn}` +
        `<button class="btn-action btn-delete" type="button" title="${escapeHtml(deleteLabel)}" aria-label="${escapeHtml(deleteLabel)}" data-del-id="${escapeHtml(s.instanceKey)}">×</button>` +
        '</div></div></div>'
      );
    })
    .join('');
  bindTaskActions(container);
}

document.getElementById('btnEmptyNew')!.addEventListener('click', postNewTask);
document.getElementById('btnNew')!.addEventListener('click', postNewTask);
document.getElementById('btnRefresh')!.addEventListener('click', () => {
  vscode.postMessage({ type: SIDEBAR_MSG_REFRESH });
});

window.addEventListener('message', (e: MessageEvent) => {
  const msg = e.data as { type?: string; items?: TaskListItemMsg[] };
  if (msg.type === SIDEBAR_MSG_UPDATE_LIST && msg.items) {
    render(msg.items);
  }
});

applyI18nToDom();
vscode.postMessage({ type: SIDEBAR_MSG_READY });
