import * as fs from 'node:fs';
import * as path from 'node:path';

/** 运行时 webview 静态资源根目录（compile 后位于 out/webview/）。 */
const WEBVIEW_ASSETS_ROOT = path.join(__dirname, 'webview');

export function loadWebviewAsset(relPath: string): string {
  const abs = path.join(WEBVIEW_ASSETS_ROOT, relPath);
  if (!fs.existsSync(abs)) {
    throw new Error(
      `webview asset missing: ${relPath} (expected ${abs}; run npm run build:webview after tsc)`,
    );
  }
  return fs.readFileSync(abs, 'utf8');
}

export function loadWebviewStyle(name: string): string {
  return loadWebviewAsset(path.join('styles', name));
}

export function loadWebviewTemplate(name: string): string {
  return loadWebviewAsset(path.join('templates', name));
}

/** 将 {{KEY}} 占位符替换为运行时注入值（CSP / nonce / script bundle 等）。 */
export function renderWebviewTemplate(name: string, vars: Record<string, string>): string {
  let html = loadWebviewTemplate(name);
  for (const [key, value] of Object.entries(vars)) {
    const token = `{{${key}}}`;
    html = html.split(token).join(value);
  }
  const leftover = html.match(/\{\{[A-Z0-9_]+\}\}/g);
  if (leftover?.length) {
    throw new Error(`webview template ${name} has unresolved placeholders: ${leftover.join(', ')}`);
  }
  return html;
}

/** 从 HTML 片段提取 id="..." 列表，供 snapshot / 契约测试。 */
export function extractHtmlElementIds(html: string): string[] {
  const ids = new Set<string>();
  const re = /\bid="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    ids.add(m[1]);
  }
  return [...ids].sort();
}

/** 测试用：将动态 CSP/nonce/script 归一化后再做 snapshot 对比。 */
export function normalizeWebviewHtmlForSnapshot(html: string): string {
  return html
    .replace(/nonce="[^"]+"/g, 'nonce="__NONCE__"')
    .replace(/content="[^"]*"/g, (attr) =>
      attr.includes('Content-Security-Policy') || attr.startsWith('content="default-src')
        ? 'content="__CSP__"'
        : attr,
    )
    .replace(
      /<script nonce="__NONCE__">window\.__stagentL10n=[\s\S]*?;<\/script>/g,
      '<script nonce="__NONCE__">window.__stagentL10n=__L10N__;</script>',
    )
    .replace(
      /<script nonce="__NONCE__">(?!\s*window\.__stagentL10n)[\s\S]*?<\/script>/g,
      '<script nonce="__NONCE__">/* bundle */</script>',
    );
}
