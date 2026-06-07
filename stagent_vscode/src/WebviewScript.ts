/**
 * 主工作流 Webview 脚本：helpers + shared + 按视图拆分的 runtime（esbuild）。
 * 构建：`npm run build:webview`（`compile` 已串联）。
 */
import * as fs from 'fs';
import * as path from 'path';

const bundleCache: Record<string, string> = {};

function loadBundleFile(name: string): string {
  if (bundleCache[name]) {
    return bundleCache[name];
  }
  const bundlePath = path.join(__dirname, 'webview', name);
  bundleCache[name] = fs.readFileSync(bundlePath, 'utf8');
  return bundleCache[name];
}

/** 主面板内联脚本：helpers → shared → main runtime */
export function buildWebviewScript(): string {
  return [
    loadBundleFile('webview-helpers.js'),
    loadBundleFile('webview-shared.js'),
    loadBundleFile('decision-pause-bar.js'),
    loadBundleFile('stage-timeline.js'),
    loadBundleFile('webview-main.js'),
  ].join('\n');
}

/** 侧栏 webview 脚本：shared + 侧栏 entry */
export function buildSidebarWebviewScript(sidebarBundle: 'ai-controls.js' | 'task-list.js'): string {
  return [loadBundleFile('webview-shared.js'), loadBundleFile(sidebarBundle)].join('\n');
}
