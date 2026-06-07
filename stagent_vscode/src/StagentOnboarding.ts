import * as vscode from 'vscode';
import { uiMsg } from './l10n/uiStrings';
import { selectChatModelsWithTimeout, UI_LM_SELECT_TIMEOUT_MS } from './LlmInvokeHelpers';

import { ONBOARDING_DONE_KEY } from './instance/StagentGlobalStateKeys';
import { getStagentConfiguration } from './settings/getStagentConfiguration';

/** P1-2：首次激活轻量配置向导（Command Palette 流程）。 */
export async function runStagentOnboardingIfNeeded(context: vscode.ExtensionContext): Promise<void> {
  if (context.globalState.get<boolean>(ONBOARDING_DONE_KEY)) {
    return;
  }

  const cfg = getStagentConfiguration();
  let lmAvailable = false;
  try {
    const models = await selectChatModelsWithTimeout({}, UI_LM_SELECT_TIMEOUT_MS);
    lmAvailable = models.length > 0;
  } catch {
    /* 选型超时或 IPC 失败时保持 lmAvailable=false */
  }
  const apiKey = (cfg.get<string>('llmApiKey') ?? '').trim();

  if (!lmAvailable && !apiKey) {
    const openSettingsLabel = uiMsg('stagent.action.openSettings');
    const laterLabel = uiMsg('stagent.action.later');
    const pick = await vscode.window.showInformationMessage(
      uiMsg('stagent.info.noLmPrompt'),
      openSettingsLabel,
      laterLabel,
    );
    if (pick === openSettingsLabel) {
      await vscode.commands.executeCommand('workbench.action.openSettings', 'stagent.llmApiKey');
    }
  }

  const profilePick = await vscode.window.showQuickPick(
    [
      { label: 'default', description: uiMsg('stagent.onboarding.profile.default.description') },
      { label: 'strict', description: uiMsg('stagent.onboarding.profile.strict.description') },
      { label: 'relaxed', description: uiMsg('stagent.onboarding.profile.relaxed.description') },
      { label: 'minimal', description: uiMsg('stagent.onboarding.profile.minimal.description') },
    ],
    {
      title: uiMsg('stagent.quickPick.selectProfile'),
      placeHolder: uiMsg('stagent.onboarding.profile.placeholder'),
    },
  );
  if (profilePick) {
    await cfg.update('settingsProfile', profilePick.label, vscode.ConfigurationTarget.Global);
  }

  await context.globalState.update(ONBOARDING_DONE_KEY, true);
}
