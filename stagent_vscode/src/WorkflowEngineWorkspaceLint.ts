/**
 * M41：工作区契约 lint 层 — 从 WorkflowEngine 抽出跨文件 / SDK / 测试质量 lint。
 */
import * as path from 'path';
import { contextMdPath } from './paths/StagentPaths';
import type { WorkflowInstance } from './WorkflowDefinition';
import { collectWorkflowArtifacts } from './WorkflowArtifactRegistry';
import { lintCrossFileKeyContract, type ProjectFile } from './CrossFileKeyContractLint';
import { collectModuleDepthWarnings } from './ModuleDepthScorer';
import { parseGlossary } from './ProjectGlossaryStore';
import { lintSampleReaderHeaderContract } from './SampleHeaderContractLint';
import { PRIMARY_DECISION_OUTPUT_KEY } from './WorkflowOutputKeys';
import {
  collectDecisionRecordsFromInstance,
  lintSdkPathContract,
  sdkPathContractIssuesToWarnings,
  type SdkPathContractIssue,
} from './SdkPathContractLint';
import { lintTestQuality, testQualityIssuesToWarnings } from './TestQualityLint';
import {
  DEFAULT_FS_READ_TIMEOUT_MS,
  pathExists,
  readTextFile,
  readTextFileIfExists,
} from './FsAsync';

export interface WorkspaceLintContext {
  instance: WorkflowInstance | undefined;
  workspaceRootAbsolute: string | undefined;
  glossaryEnabled: boolean;
  sdkPathContractLintMode: 'off' | 'warn' | 'hard';
}

export async function collectWorkspaceProjectFiles(ctx: WorkspaceLintContext): Promise<ProjectFile[]> {
  const ws = ctx.workspaceRootAbsolute;
  if (!ws || !ctx.instance) {
    return [];
  }
  const registry = collectWorkflowArtifacts(ctx.instance.definition);
  const candidates = registry.paths.filter((rel) =>
    /\.(py|json|ya?ml|tsx?|jsx?|mjs|cjs)$/i.test(rel),
  );
  const reads = await Promise.all(
    candidates.map(async (rel) => {
      try {
        const abs = path.join(ws, rel);
        if (!(await pathExists(abs))) {
          return undefined;
        }
        return { path: rel, content: await readTextFile(abs, { timeoutMs: DEFAULT_FS_READ_TIMEOUT_MS }) };
      } catch {
        return undefined;
      }
    }),
  );
  return reads.filter((f): f is ProjectFile => f !== undefined);
}

export function collectSdkPathContractIssues(
  ctx: WorkspaceLintContext,
  files: ProjectFile[],
): SdkPathContractIssue[] {
  if (!ctx.instance || ctx.sdkPathContractLintMode === 'off') {
    return [];
  }
  const registry = collectWorkflowArtifacts(ctx.instance.definition);
  const decisionRecords = collectDecisionRecordsFromInstance(
    ctx.instance.definition,
    ctx.instance.stageRuntimes.map((rt) => ({
      stageId: rt.stageId,
      decisionRecord: rt.outputs[PRIMARY_DECISION_OUTPUT_KEY],
    })),
  );
  return lintSdkPathContract({
    workflow: ctx.instance.definition,
    files,
    decisionRecords,
    registry,
  });
}

export async function runWorkspaceContractLint(ctx: WorkspaceLintContext): Promise<string[]> {
  const files = await collectWorkspaceProjectFiles(ctx);
  const ws = ctx.workspaceRootAbsolute;
  if (!ws || !ctx.instance) {
    return [];
  }
  const warnings: string[] = [];
  if (files.length >= 2) {
    let canonicalKeys: string[] | undefined;
    if (ctx.glossaryEnabled) {
      try {
        const ctxPath = contextMdPath(ws);
        const ctxRaw = await readTextFileIfExists(ctxPath, { timeoutMs: DEFAULT_FS_READ_TIMEOUT_MS });
        if (ctxRaw !== undefined) {
          canonicalKeys = parseGlossary(ctxRaw).map((e) => e.term);
        }
      } catch {
        // CONTEXT.md 读失败不影响主 lint
      }
    }
    warnings.push(
      ...lintCrossFileKeyContract(files, canonicalKeys, {
        contextAsSoleAuthority: !!canonicalKeys?.length && ctx.glossaryEnabled,
      }).warnings,
    );
    for (const f of files) {
      if (/(^|\/)(test_|tests?\/).*\.py$|_test\.py$/i.test(f.path)) {
        warnings.push(...testQualityIssuesToWarnings(f.path, lintTestQuality(f.content)));
      }
    }
    warnings.push(...lintSampleReaderHeaderContract(files));
    warnings.push(...collectModuleDepthWarnings(files));
  }
  if (ctx.sdkPathContractLintMode === 'warn') {
    warnings.push(...sdkPathContractIssuesToWarnings(collectSdkPathContractIssues(ctx, files)));
  }
  return warnings;
}

export async function runSdkPathContractHardGate(
  ctx: WorkspaceLintContext,
): Promise<SdkPathContractIssue | null> {
  if (ctx.sdkPathContractLintMode !== 'hard') {
    return null;
  }
  const files = await collectWorkspaceProjectFiles(ctx);
  const issues = collectSdkPathContractIssues(ctx, files);
  return issues[0] ?? null;
}
