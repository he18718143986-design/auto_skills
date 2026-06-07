/**
 * M41：生成物 UI 动作 — openArtifactFile / openArtifactDiff / 调试日志复制与打开。
 */
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import type { ToolPathBase, WorkflowInstance } from './WorkflowDefinition';
import { findStageArtifact, resolveStageArtifactAbsPath } from './ArtifactUiHints';
import { buildDebugLogCopyResult } from './DebugLogUtils';
import { DEFAULT_FS_READ_TIMEOUT_MS, pathExists, readTextFileIfExists } from './FsAsync';
import { uiMsg } from './l10n/uiStrings';
import { sessionDebugLogPath } from './SessionDebugLog';
import { taskDebugLogPath } from './paths/StagentPaths';

export interface ArtifactUiHost {
  getInstance(): WorkflowInstance | undefined;
  getCurrentInstanceKey(): string | undefined;
  resolveOutputPath(instanceKey: string, filePath: string, base?: ToolPathBase): string;
  ensureTaskDir(instanceKey: string): string;
}

export async function openArtifactFileAction(
  host: ArtifactUiHost,
  stageId: string,
  filePath: string,
): Promise<void> {
  if (!host.getInstance() || !host.getCurrentInstanceKey()) {
    return;
  }
  const stage = host.getInstance()!.definition.stages.find((s) => s.id === stageId);
  if (!stage || stage.isDecisionStage) {
    void vscode.window.showWarningMessage(uiMsg('stagent.warn.decisionNoArtifactReview'));
    return;
  }
  const absPath = resolveStageArtifactAbsPath(
    stage,
    filePath,
    host.getInstance()!.artifactRegistry,
    (relativePath, base) =>
      host.resolveOutputPath(host.getCurrentInstanceKey()!, relativePath, base ?? 'instance'),
  );
  if (!fs.existsSync(absPath)) {
    void vscode.window.showWarningMessage(uiMsg('stagent.warn.fileNotFound', absPath));
    return;
  }
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(absPath));
  await vscode.window.showTextDocument(doc, { preview: true });
}

export async function openArtifactDiffAction(
  host: ArtifactUiHost,
  stageId: string,
  filePath: string,
): Promise<void> {
  if (!host.getInstance() || !host.getCurrentInstanceKey()) {
    return;
  }
  const stage = host.getInstance()!.definition.stages.find((s) => s.id === stageId);
  if (!stage || stage.isDecisionStage) {
    void vscode.window.showWarningMessage(uiMsg('stagent.warn.decisionNoDiff'));
    return;
  }
  const absPath = resolveStageArtifactAbsPath(
    stage,
    filePath,
    host.getInstance()!.artifactRegistry,
    (relativePath, base) =>
      host.resolveOutputPath(host.getCurrentInstanceKey()!, relativePath, base ?? 'instance'),
  );
  const art = findStageArtifact(host.getInstance()!.artifactRegistry, stageId, absPath);
  const canDiff = !!(art?.existedBefore && art.priorContent !== undefined);
  if (!canDiff) {
    void vscode.window.showInformationMessage(uiMsg('stagent.info.newFileNoPrior'));
    await openArtifactFileAction(host, stageId, filePath);
    return;
  }
  const prior = art!.priorContent ?? '';
  const current = (await readTextFileIfExists(absPath, { timeoutMs: DEFAULT_FS_READ_TIMEOUT_MS })) ?? '';
  const ext = path.extname(absPath).slice(1);
  const left = await vscode.workspace.openTextDocument({ content: prior, language: ext || undefined });
  const right = await vscode.workspace.openTextDocument({ content: current, language: ext || undefined });
  const title = `${path.basename(absPath)} (回滚前 ↔ 当前)`;
  await vscode.commands.executeCommand('vscode.diff', left.uri, right.uri, title);
}

export async function copyRecentDebugLogAction(host: ArtifactUiHost): Promise<void> {
  if (!host.getInstance() || !host.getCurrentInstanceKey()) {
    await vscode.window.showWarningMessage(uiMsg('stagent.warn.noDebugInstance'));
    return;
  }
  const debugPath = taskDebugLogPath(host.ensureTaskDir(host.getCurrentInstanceKey()!));
  const raw = await readTextFileIfExists(debugPath, { timeoutMs: DEFAULT_FS_READ_TIMEOUT_MS });
  const result = buildDebugLogCopyResult(raw);
  if (!result.ok) {
    await vscode.window.showWarningMessage(uiMsg('stagent.warn.noDebugLogFile'));
    return;
  }
  await vscode.env.clipboard.writeText(result.content);
  await vscode.window.showInformationMessage(uiMsg('stagent.info.debugLogCopied'));
}

export async function copyRecentSessionLogAction(globalStorageFsPath: string): Promise<void> {
  const sessionPath = sessionDebugLogPath(globalStorageFsPath);
  const raw = await readTextFileIfExists(sessionPath, { timeoutMs: DEFAULT_FS_READ_TIMEOUT_MS });
  const result = buildDebugLogCopyResult(raw);
  if (!result.ok) {
    await vscode.window.showWarningMessage(uiMsg('stagent.warn.noSessionLog'));
    return;
  }
  await vscode.env.clipboard.writeText(result.content);
  await vscode.window.showInformationMessage(uiMsg('stagent.info.sessionLogCopied'));
}

export async function openDebugLogAction(host: ArtifactUiHost): Promise<void> {
  if (!host.getInstance() || !host.getCurrentInstanceKey()) {
    await vscode.window.showWarningMessage(uiMsg('stagent.warn.noActiveTaskForDebug'));
    return;
  }
  const debugPath = taskDebugLogPath(host.ensureTaskDir(host.getCurrentInstanceKey()!));
  if (!(await pathExists(debugPath))) {
    await vscode.window.showWarningMessage(uiMsg('stagent.warn.noDebugLogForTask'));
    return;
  }
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(debugPath));
  await vscode.window.showTextDocument(doc, { preview: false });
}
