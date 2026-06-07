import { wMsg } from './wMsg';

type I18nElement = {
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
  setAttribute(name: string, value: string): void;
  textContent: string | null;
  placeholder?: string;
};

/** Apply `data-i18n-*` attributes under root (default: document). Call once at webview startup. */
export function applyI18nToDom(root: { querySelectorAll(sel: string): Iterable<I18nElement> } = document): void {
  root.querySelectorAll('[data-i18n-aria-label-key]').forEach((el) => {
    const ariaKey = el.getAttribute('data-i18n-aria-label-key');
    if (ariaKey) {
      el.setAttribute('aria-label', wMsg(ariaKey));
    }
  });
  root.querySelectorAll('[data-i18n-key]').forEach((el) => {
    const key = el.getAttribute('data-i18n-key');
    if (!key) {
      return;
    }
    const titleKey = el.getAttribute('data-i18n-title-key');
    if (titleKey) {
      (el as { title?: string }).title = wMsg(titleKey);
    }
    const text = wMsg(key);
    if (el.hasAttribute('data-i18n-placeholder') && 'placeholder' in el) {
      el.placeholder = text;
    } else if (!el.hasAttribute('data-i18n-placeholder-only')) {
      el.textContent = text;
    }
  });
}
