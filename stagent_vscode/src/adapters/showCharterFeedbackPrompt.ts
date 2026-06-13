import * as vscode from 'vscode';
import * as path from 'path';
import { plainCharterFeedbackDescription } from '../friendly/toPlainLanguage';
import { uiMsg } from '../l10n/uiStrings';
import type { CharterFeedbackCandidate } from '../charter/CharterFeedbackTypes';
import { appendCharterFeedbackEntries } from '../charter/CharterWriter';
import { clearCharterCache } from '../charter/CharterContextService';

const RECORD_PREVIEW_MAX = 72;

function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) {
    return t;
  }
  return `${t.slice(0, max)}…`;
}

function quadrantLabel(type: string): string {
  const key = `stagent.charter.feedback.type.${type}`;
  const resolved = uiMsg(key);
  return resolved !== key ? resolved : type;
}

export interface CharterFeedbackPromptResult {
  written: boolean;
  appendedCount: number;
  absolutePath: string;
}

/** VS Code adapter：session 结束多选候选并确认写入 Charter。 */
export async function showCharterFeedbackPrompt(
  candidates: CharterFeedbackCandidate[],
  workspaceRoot: string,
  charterRelativePath: string,
): Promise<CharterFeedbackPromptResult | undefined> {
  if (candidates.length === 0) {
    return undefined;
  }

  const intro = uiMsg('stagent.info.charterFeedbackIntro', candidates.length);
  const review = uiMsg('stagent.action.reviewCharterFeedback');
  const later = uiMsg('stagent.action.later');
  const first = await vscode.window.showInformationMessage(intro, review, later);
  if (first !== review) {
    return undefined;
  }

  type QuickItem = vscode.QuickPickItem & { candidate: CharterFeedbackCandidate };
  const items: QuickItem[] = candidates.map((c) => ({
    label: c.stageTitle,
    description: `[${quadrantLabel(c.suggestedType)}] ${truncate(c.decisionRecord, RECORD_PREVIEW_MAX)}`,
    detail: plainCharterFeedbackDescription(c),
    candidate: c,
    picked: true,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    title: uiMsg('stagent.info.charterFeedbackPickTitle'),
    placeHolder: uiMsg('stagent.info.charterFeedbackPickPlaceholder'),
  });
  if (!picked || picked.length === 0) {
    return undefined;
  }

  const absPath = path.join(workspaceRoot, charterRelativePath);
  const confirm = await vscode.window.showInformationMessage(
    uiMsg('stagent.info.charterFeedbackConfirm', picked.length, charterRelativePath),
    uiMsg('stagent.action.writeCharter'),
    later,
  );
  if (confirm !== uiMsg('stagent.action.writeCharter')) {
    return undefined;
  }

  const result = appendCharterFeedbackEntries(
    absPath,
    picked.map((item) => ({
      type: item.candidate.suggestedType,
      text: item.candidate.decisionRecord,
      stageId: item.candidate.stageId,
      provenance: item.candidate.provenance,
    })),
  );
  clearCharterCache();

  const doc = await vscode.workspace.openTextDocument(result.absolutePath);
  await vscode.window.showTextDocument(doc, { preview: false });
  void vscode.window.showInformationMessage(
    uiMsg('stagent.info.charterFeedbackWritten', result.appendedCount, result.nextVersion),
  );

  return {
    written: true,
    appendedCount: result.appendedCount,
    absolutePath: result.absolutePath,
  };
}
