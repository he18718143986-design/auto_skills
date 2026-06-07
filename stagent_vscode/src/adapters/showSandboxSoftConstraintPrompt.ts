import * as vscode from 'vscode';
import type { SandboxCapabilityState } from '../sandbox/SandboxCapabilityMatrix';
import { uiMsg } from '../l10n/uiStrings';

/** 无内核级沙箱时一次性提示：用户可选择以软约束继续或取消。 */
export async function showSandboxSoftConstraintPrompt(
  capability: SandboxCapabilityState,
): Promise<boolean> {
  const message = uiMsg(
    'stagent.sandbox.softConstraintPrompt',
    capability.platform,
    capability.detail,
  );
  const continueLabel = uiMsg('stagent.sandbox.softConstraintContinue');
  const cancelLabel = uiMsg('stagent.sandbox.softConstraintCancel');
  const choice = await vscode.window.showWarningMessage(message, continueLabel, cancelLabel);
  return choice === continueLabel;
}
