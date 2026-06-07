import { uiMsg } from './l10n/uiStrings';
import { INPUT_PAGE_BUSY_TITLE_KEYS } from './WebviewInputGenerationUi';

export function getHostInputPageBusyTitle(op: keyof typeof INPUT_PAGE_BUSY_TITLE_KEYS): string {
  return uiMsg(INPUT_PAGE_BUSY_TITLE_KEYS[op]);
}

/** Extension host: localized busy titles for postMessage progress (not webview-injected). */
export const HOST_INPUT_PAGE_BUSY_TITLES = new Proxy(
  {} as { [K in keyof typeof INPUT_PAGE_BUSY_TITLE_KEYS]: string },
  {
    get(_target, prop: string) {
      if (prop in INPUT_PAGE_BUSY_TITLE_KEYS) {
        return getHostInputPageBusyTitle(prop as keyof typeof INPUT_PAGE_BUSY_TITLE_KEYS);
      }
      return undefined;
    },
  },
);
