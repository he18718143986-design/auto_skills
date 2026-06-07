#!/usr/bin/env node
/**
 * Webview bundles:
 * - webview-helpers.js  — 纯函数（主面板 + 与 helpers 同源的校验逻辑）
 * - webview-shared.js   — escapeHtml / formatRelativeTimeZh（主面板 runtime + 侧栏）
 * - webview-main.js     — 主面板按视图拆分的 runtime
 * - ai-controls.js / task-list.js — 侧栏
 */
import * as esbuild from 'esbuild';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(ROOT, 'out/webview');
const srcWebviewDir = path.join(ROOT, 'src/webview');
const pathShim = path.join(ROOT, 'src/webview/shims/path-browser.ts');

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(from, to);
    } else {
      fs.copyFileSync(from, to);
    }
  }
}

function copyWebviewStaticAssets() {
  for (const sub of ['templates', 'styles']) {
    const src = path.join(srcWebviewDir, sub);
    if (!fs.existsSync(src)) {
      throw new Error(`missing webview static dir: ${src}`);
    }
    copyDirRecursive(src, path.join(outDir, sub));
  }
}

const WEBVIEW_HELPER_EXPORTS = [
  'getPauseUiState',
  'shouldHideOutput',
  'buildAnswerQuestionsBeforeMessage',
  'buildAnswerQuestionsMessage',
  'validateRequiredAnswers',
  'formatRequiredAnswersValidationError',
  'shouldShowQualitySoftPrompt',
  'getUncheckedCount',
  'shouldShowDecisionConflictBanner',
  'getDecisionApproveAction',
  'shouldAskRetryConfirm',
  'canProceedRetry',
  'countDecisionRetryDownstreamStages',
  'formatDecisionRetryConfirmMessage',
  'formatGlobalConfigSummaryForConfirm',
  'formatPlanSummaryLines',
  'formatStageSourceSummaryLines',
  'computePlanStageDiff',
  'formatPlanStageDiffLines',
  'isFirstDecisionStage',
  'shouldShowPlanReviewChecklist',
  'buildPlanReviewChecklistLines',
  'formatStreamCharSuffix',
  'buildLlmWaitingDetail',
  'buildWorkflowDagGraphHtml',
  'shouldShowWorkflowDagGraph',
  'normalizeArtifactPath',
  'getStageArtifactPath',
  'collectArtifactPathsFromStages',
  'getArtifactHeuristicWarnings',
  'parsePhaseFromTitle',
  'stripPhasePrefix',
  'truncateConfirmText',
  'countStagesByKind',
  'buildConfirmStatsLines',
];

const WEBVIEW_SHARED_EXPORTS = ['escapeHtml', 'formatRelativeTime', 'wMsg', 'applyI18nToDom'];

async function bundleIife({ entry, outfile, globalName, exportNames, jsx = false }) {
  const result = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    format: 'iife',
    globalName,
    platform: 'browser',
    target: ['es2020'],
    write: false,
    sourcemap: false,
    logLevel: 'warning',
    jsx: jsx ? 'automatic' : undefined,
    jsxImportSource: jsx ? 'preact' : undefined,
    alias: globalName === '__stagentWebviewHelpers' ? { path: pathShim } : undefined,
  });
  const bundled = result.outputFiles[0]?.text;
  if (!bundled) {
    throw new Error(`esbuild produced no output for ${entry}`);
  }
  const globals =
    exportNames?.map((name) => `var ${name} = ${globalName}.${name};`).join('\n') ?? '';
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outfile, globals ? `${bundled}\n${globals}\n` : `${bundled}\n`, 'utf8');
}

async function main() {
  copyWebviewStaticAssets();

  await bundleIife({
    entry: path.join(ROOT, 'src/webview/webview-helpers-entry.ts'),
    outfile: path.join(outDir, 'webview-helpers.js'),
    globalName: '__stagentWebviewHelpers',
    exportNames: WEBVIEW_HELPER_EXPORTS,
  });

  await bundleIife({
    entry: path.join(ROOT, 'src/webview/webview-shared-entry.ts'),
    outfile: path.join(outDir, 'webview-shared.js'),
    globalName: '__stagentWebviewShared',
    exportNames: WEBVIEW_SHARED_EXPORTS,
  });

  await bundleIife({
    entry: path.join(ROOT, 'src/webview/decision-pause-bar-entry.tsx'),
    outfile: path.join(outDir, 'decision-pause-bar.js'),
    globalName: '__stagentDecisionPauseBar',
    exportNames: ['mountDecisionPauseBarDock'],
    jsx: true,
  });

  await bundleIife({
    entry: path.join(ROOT, 'src/webview/stage-timeline-entry.tsx'),
    outfile: path.join(outDir, 'stage-timeline.js'),
    globalName: '__stagentStageTimeline',
    exportNames: ['mountStageTimeline'],
    jsx: true,
  });

  await bundleIife({
    entry: path.join(ROOT, 'src/webview/webview-main-entry.ts'),
    outfile: path.join(outDir, 'webview-main.js'),
    globalName: '__stagentWebviewMain',
    exportNames: null,
  });

  await bundleIife({
    entry: path.join(ROOT, 'src/webview/sidebar/ai-controls-entry.ts'),
    outfile: path.join(outDir, 'ai-controls.js'),
    globalName: '__stagentAiControls',
    exportNames: null,
  });

  await bundleIife({
    entry: path.join(ROOT, 'src/webview/sidebar/task-list-entry.ts'),
    outfile: path.join(outDir, 'task-list.js'),
    globalName: '__stagentTaskList',
    exportNames: null,
  });

  console.log(
    `[build-webview] wrote ${outDir} (helpers=${WEBVIEW_HELPER_EXPORTS.length}, shared=${WEBVIEW_SHARED_EXPORTS.length}, main, sidebars, templates, styles)`,
  );
}

main().catch((err) => {
  console.error('[build-webview] failed:', err);
  process.exit(1);
});
