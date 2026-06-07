import { wMsg } from '../l10n/wMsg';
import { MS_PER_DAY, MS_PER_HOUR, MS_PER_MINUTE } from './timeConstants';

/** Task list sidebar: relative time label. */
export function formatRelativeTime(iso: string | undefined | null): string {
  if (!iso) {
    return '';
  }
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < MS_PER_MINUTE) {
    return wMsg('stagent.webview.time.justNow');
  }
  if (diff < MS_PER_HOUR) {
    return wMsg('stagent.webview.time.minutesAgo', Math.floor(diff / MS_PER_MINUTE));
  }
  if (diff < MS_PER_DAY) {
    return wMsg('stagent.webview.time.hoursAgo', Math.floor(diff / MS_PER_HOUR));
  }
  return new Date(iso).toLocaleString();
}

/** @deprecated Use formatRelativeTime */
export const formatRelativeTimeZh = formatRelativeTime;
