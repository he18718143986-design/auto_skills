import * as vscode from 'vscode';
import { buildMilestoneVerifyHint } from '../friendly/milestoneVerifyHint';
import { uiMsg } from '../l10n/uiStrings';
import type { WorkflowInstance } from '../WorkflowDefinition';

/** B-R3 G4：工作流完成后展示白话验收提示。 */
export async function showMilestoneVerifyHintIfAny(instance: WorkflowInstance): Promise<void> {
  const hint = buildMilestoneVerifyHint(instance);
  if (!hint) {
    return;
  }
  const title = uiMsg('stagent.info.milestoneVerifyHint');
  await vscode.window.showInformationMessage(`${title} ${hint}`);
}
