/**
 * 侧栏 + 主面板共用的轻量 DOM 工具（esbuild → out/webview/webview-shared.js）。
 */
export { applyI18nToDom } from './l10n/applyI18n';
export { wMsg } from './l10n/wMsg';
export { escapeHtml } from './shared/escapeHtml';
export { formatRelativeTime } from './shared/formatRelativeTimeZh';

export const WEBVIEW_SHARED_EXPORTS = ['escapeHtml', 'formatRelativeTime', 'wMsg', 'applyI18nToDom'] as const;
