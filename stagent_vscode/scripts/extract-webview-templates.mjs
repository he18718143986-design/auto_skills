#!/usr/bin/env node
/** 一次性/维护用：从 TS 内联字符串提取 webview HTML/CSS 到 src/webview/templates|styles */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TPL = path.join(ROOT, 'src/webview/templates');
const STYLES = path.join(ROOT, 'src/webview/styles');

function writeShell(name, bodyHtml, cssFromFile) {
  const css = fs.readFileSync(cssFromFile, 'utf8').trimEnd();
  const shell = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="{{CSP}}">
  <title>Stagent</title>
  <style>
{{STYLES}}
  </style>
</head>
<body>
${bodyHtml}
  <script nonce="{{NONCE}}">
{{SCRIPT}}
  </script>
</body>
</html>
`;
  fs.writeFileSync(path.join(TPL, name), shell, 'utf8');
}

function writeSidebarShell(name, bodyHtml, cssRel) {
  const css = fs.readFileSync(path.join(STYLES, cssRel), 'utf8').trimEnd();
  const shell = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="{{CSP}}">
  <style>
{{STYLES}}
  </style>
</head>
<body>
${bodyHtml}
  <script nonce="{{NONCE}}">
{{SCRIPT}}
  </script>
</body>
</html>
`;
  fs.writeFileSync(path.join(TPL, name), shell, 'utf8');
  void css;
}

// CSS from WebviewStyles.ts
const stylesSrc = fs.readFileSync(path.join(ROOT, 'src/WebviewStyles.ts'), 'utf8');
const cssMatch = stylesSrc.match(/export const WEBVIEW_STYLES = `([\s\S]*?)`;/);
if (!cssMatch) {
  throw new Error('WEBVIEW_STYLES not found');
}
const mainCss = `${cssMatch[1].replace(/^    /gm, '').trimEnd()}\n`;
fs.mkdirSync(STYLES, { recursive: true });
fs.writeFileSync(path.join(STYLES, 'main-panel.css'), mainCss);

// main panel body
const panelSrc = fs.readFileSync(path.join(ROOT, 'src/WebviewPanel.ts'), 'utf8');
const bodyMatch = panelSrc.match(/<body>([\s\S]*?)<script nonce=/);
if (!bodyMatch) {
  throw new Error('main panel body not found');
}
fs.mkdirSync(TPL, { recursive: true });
writeShell('main-panel.html', bodyMatch[1].trimEnd(), path.join(STYLES, 'main-panel.css'));

function extractProviderCssAndBody(tsPath) {
  const src = fs.readFileSync(tsPath, 'utf8');
  const styleMatch = src.match(/<style>([\s\S]*?)<\/style>/);
  const bodyMatch = src.match(/<body>([\s\S]*?)<script nonce=/);
  if (!styleMatch || !bodyMatch) {
    throw new Error(`extract failed: ${tsPath}`);
  }
  return { css: `${styleMatch[1].trim()}\n`, body: bodyMatch[1].trimEnd() };
}

const ai = extractProviderCssAndBody(path.join(ROOT, 'src/StagentAiControlsProvider.ts'));
fs.writeFileSync(path.join(STYLES, 'ai-controls.css'), ai.css);
writeSidebarShell('ai-controls.html', ai.body, 'ai-controls.css');

const tl = extractProviderCssAndBody(path.join(ROOT, 'src/StagentTaskListProvider.ts'));
fs.writeFileSync(path.join(STYLES, 'task-list.css'), tl.css);
writeSidebarShell('task-list.html', tl.body, 'task-list.css');

console.log('[extract-webview-templates] wrote src/webview/templates + styles');
