/** 输入页生成/润色进度文案（纯函数，便于单测） */

import { resolveWebviewString } from './webview/l10n/resolveWebviewString';

export function formatStreamCharSuffix(charCount: number): string {
  if (!Number.isFinite(charCount) || charCount <= 0) {
    return '';
  }
  return resolveWebviewString('stagent.webview.input.streamCharSuffix', charCount);
}

/** 去掉详情文案中已追加的流式字数后缀（可多次出现，用于从 DOM 恢复 base） */
export function stripStreamCharSuffix(text: string): string {
  return text
    .replace(/\s·\s(?:已接收约 \d+ 字|~?\d+ chars received)/gi, '')
    .trimEnd();
}

export function buildLlmWaitingDetail(taskTypeAuto: boolean): string {
  const typeHint = taskTypeAuto
    ? resolveWebviewString('stagent.webview.input.llmWaitingWithAutoType')
    : resolveWebviewString('stagent.webview.input.llmWaitingWorkflowOnly');
  return `${typeHint} ${resolveWebviewString('stagent.webview.input.llmWaitingTail')}`;
}

export const INPUT_PAGE_BUSY_TITLE_KEYS = {
  workflowSubmitted: 'stagent.webview.input.busyWorkflowSubmitted',
  polishSubmitted: 'stagent.webview.input.busyPolishSubmitted',
  workflowPreparing: 'stagent.webview.input.busyWorkflowPreparing',
  workflowLlm: 'stagent.webview.input.busyWorkflowLlm',
  workflowValidating: 'stagent.webview.input.busyWorkflowValidating',
} as const;

export function getInputPageBusyTitle(op: keyof typeof INPUT_PAGE_BUSY_TITLE_KEYS): string {
  return resolveWebviewString(INPUT_PAGE_BUSY_TITLE_KEYS[op]);
}

export const INPUT_PAGE_BUSY_TITLES = new Proxy(
  {} as { [K in keyof typeof INPUT_PAGE_BUSY_TITLE_KEYS]: string },
  {
    get(_target, prop: string) {
      if (prop in INPUT_PAGE_BUSY_TITLE_KEYS) {
        return getInputPageBusyTitle(prop as keyof typeof INPUT_PAGE_BUSY_TITLE_KEYS);
      }
      return undefined;
    },
  },
);
