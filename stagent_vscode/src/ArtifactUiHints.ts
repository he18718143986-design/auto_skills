import * as path from 'path';
import { resolveEffectiveEnableDagScheduler } from './EffectiveSettings';
import { resolveWebviewString } from './webview/l10n/resolveWebviewString';
import type { Artifact, ArtifactState } from './ArtifactTypes';
import type { Stage, ToolPathBase, WorkflowGlobalConfig } from './WorkflowDefinition';
import { listStageArtifactPathEntries, type StageArtifactPathSource } from './workflow/stageArtifactPaths';

export interface StageArtifactHint {
  filePath: string;
  state?: ArtifactState;
  canDiff: boolean;
}

export interface DownstreamResetPanelInput {
  resetStageTitles: string[];
  rolledBackFiles?: string[];
  rollbackFailed?: Array<{ filePath: string; error: string }>;
}

/** 确认页只读展示 globalConfig 关键项（M19.3） */
export function formatGlobalConfigSummaryForConfirm(
  globalConfig: WorkflowGlobalConfig | undefined,
): string[] {
  const gc = globalConfig ?? {};
  const lines: string[] = [resolveWebviewString('stagent.webview.plan.globalConfigHeader')];
  lines.push(
    resolveEffectiveEnableDagScheduler(gc)
      ? resolveWebviewString('stagent.webview.plan.dagOn')
      : resolveWebviewString('stagent.webview.plan.dagOff'),
  );
  if (gc.dagMaxParallelism !== undefined) {
    lines.push(resolveWebviewString('stagent.webview.plan.dagParallelism', gc.dagMaxParallelism));
  }
  const inject =
    gc.injectApprovedDecisionContext === true
      ? resolveWebviewString('stagent.webview.plan.injectOn')
      : gc.injectApprovedDecisionContext === false
        ? resolveWebviewString('stagent.webview.plan.injectOff')
        : resolveWebviewString('stagent.webview.plan.injectFollowVsCode');
  lines.push(resolveWebviewString('stagent.webview.plan.decisionInject', inject));
  if (gc.globalDecisionInjectMode) {
    lines.push(resolveWebviewString('stagent.webview.plan.decisionInjectMode', gc.globalDecisionInjectMode));
  }
  lines.push(
    gc.enableDecisionContentLint === false
      ? resolveWebviewString('stagent.webview.plan.decisionHardOff')
      : gc.enableDecisionContentLint === true
        ? resolveWebviewString('stagent.webview.plan.decisionHardOn')
        : resolveWebviewString('stagent.webview.plan.decisionHardDefault'),
  );
  if (gc.language) {
    lines.push(resolveWebviewString('stagent.webview.plan.language', gc.language));
  }
  if (gc.modelOverrides) {
    const parts: string[] = [];
    if (gc.modelOverrides.decisionStage) {
      parts.push(resolveWebviewString('stagent.webview.plan.modelDecision', gc.modelOverrides.decisionStage));
    }
    if (gc.modelOverrides.implStage) {
      parts.push(resolveWebviewString('stagent.webview.plan.modelImpl', gc.modelOverrides.implStage));
    }
    if (gc.modelOverrides.lightweightStage) {
      parts.push(resolveWebviewString('stagent.webview.plan.modelLight', gc.modelOverrides.lightweightStage));
    }
    if (parts.length) {
      lines.push(resolveWebviewString('stagent.webview.plan.modelOverrides', parts.join('；')));
    }
  }
  return lines;
}

function listStageOutputFilePaths(
  stage: Stage,
): Array<{ relativePath: string; pathBase?: ToolPathBase }> {
  return listStageArtifactPathEntries(stage as StageArtifactPathSource);
}

function basenameMatches(a: string, b: string): boolean {
  return path.basename(a) === path.basename(b) || a.endsWith(b) || b.endsWith(a);
}

/** 从 registry + stage 配置汇总暂停栏工件提示（M19.2 / M19.4） */
export function collectStageArtifactHints(
  registry: Artifact[] | undefined,
  stage: Stage,
): StageArtifactHint[] {
  const hints: StageArtifactHint[] = [];
  const seen = new Set<string>();

  if (registry) {
    for (const art of registry) {
      if (art.stageId !== stage.id) {
        continue;
      }
      if (art.state === 'rolled-back' || art.state === 'superseded') {
        continue;
      }
      const key = path.normalize(art.filePath);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      hints.push({
        filePath: art.filePath,
        state: art.state,
        canDiff: !!(art.existedBefore && art.priorContent !== undefined),
      });
    }
  }

  for (const p of listStageOutputFilePaths(stage)) {
    const rel = p.relativePath;
    if (hints.some((h) => basenameMatches(h.filePath, rel))) {
      continue;
    }
    hints.push({ filePath: rel, canDiff: false });
  }

  return hints;
}

export function findStageArtifact(
  registry: Artifact[] | undefined,
  stageId: string,
  filePath: string,
): Artifact | undefined {
  if (!registry?.length) {
    return undefined;
  }
  const normHint = path.normalize(filePath);
  return [...registry]
    .reverse()
    .find(
      (a) =>
        a.stageId === stageId &&
        a.state !== 'rolled-back' &&
        a.state !== 'superseded' &&
        (path.normalize(a.filePath) === normHint || basenameMatches(a.filePath, filePath)),
    );
}

export function resolveStageArtifactAbsPath(
  stage: Stage,
  filePath: string,
  registry: Artifact[] | undefined,
  resolveOutputPath: (relativePath: string, base?: ToolPathBase) => string,
): string {
  if (path.isAbsolute(filePath)) {
    return path.normalize(filePath);
  }
  const art = findStageArtifact(registry, stage.id, filePath);
  if (art) {
    return art.filePath;
  }
  const paths = listStageOutputFilePaths(stage);
  const match =
    paths.find((p) => p.relativePath === filePath || basenameMatches(p.relativePath, filePath)) ??
    paths[0];
  if (match) {
    return resolveOutputPath(match.relativePath, match.pathBase ?? 'instance');
  }
  return resolveOutputPath(filePath, 'instance');
}

/** downstreamReset 内联面板文案行（M19.1 · 便于单测） */
export function formatDownstreamResetPanelLines(input: DownstreamResetPanelInput): string[] {
  const lines: string[] = [];
  lines.push(resolveWebviewString('stagent.webview.plan.downstreamReset'));
  for (const t of input.resetStageTitles) {
    lines.push(`· ${t}`);
  }
  if (input.rolledBackFiles?.length) {
    lines.push('');
    lines.push(resolveWebviewString('stagent.webview.plan.rolledBack'));
    for (const f of input.rolledBackFiles) {
      lines.push(`· ${f}`);
    }
  }
  if (input.rollbackFailed?.length) {
    lines.push('');
    lines.push(resolveWebviewString('stagent.webview.plan.rollbackFailed'));
    for (const f of input.rollbackFailed) {
      lines.push(`· ${f.filePath}: ${f.error}`);
    }
  }
  return lines;
}
