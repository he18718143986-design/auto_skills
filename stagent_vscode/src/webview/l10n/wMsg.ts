/** Webview UI string lookup (injected as `window.__stagentL10n` from extension host). */
export function wMsg(key: string, ...placeholders: Array<string | number>): string {
  const map = (globalThis as { __stagentL10n?: Record<string, string> }).__stagentL10n;
  let text = map?.[key] ?? key;
  placeholders.forEach((val, i) => {
    text = text.replace(new RegExp(`\\{${i}\\}`, 'g'), String(val));
  });
  return text;
}
