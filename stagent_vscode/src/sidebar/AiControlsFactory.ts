import * as vscode from 'vscode';
import { readSettingsProfileId } from '../StagentSettings';
import { buildProfileHighlights } from '../StagentProfileHighlights';
import type { SettingsProfileId } from '../StagentSettingsProfiles';
import { StagentAiControlsProvider } from '../StagentAiControlsProvider';
import { buildRetryStageOptions } from '../WorkflowStageProgressQuery';
import type { WorkflowEngine } from '../WorkflowEngine';
import { runSettingsValidation } from '../ExtensionSettingsBootstrap';
import { uiMsg } from '../l10n/uiStrings';
import { selectChatModelsWithTimeout, UI_LM_SELECT_TIMEOUT_MS } from '../LlmInvokeHelpers';
import { getStagentConfiguration } from '../settings/getStagentConfiguration';
import { readSandboxEnabled } from '../settings/readers/exec';
import { resolveSandboxCapability } from '../sandbox/SandboxCapabilityMatrix';
import type { HitlRetryResult } from '../hitl/HitlRetryResult';

function sidebarRetryRejectToast(result: Extract<HitlRetryResult, { ok: false }>): string {
  switch (result.reason) {
    case 'no-instance':
      return uiMsg('stagent.warn.instanceNotBound');
    case 'stage-not-actionable':
      return uiMsg('stagent.warn.sidebarRetryNotActionable');
    case 'retry-limit-exceeded':
      return uiMsg('stagent.warn.reason', result.message);
  }
}

export function createAiControlsProvider(
  engine: WorkflowEngine,
  refreshAiControls: () => void,
): StagentAiControlsProvider {
  return new StagentAiControlsProvider(
    async () => {
      const lmModels: { id: string; name: string }[] = [];
      try {
        const all = await selectChatModelsWithTimeout({}, UI_LM_SELECT_TIMEOUT_MS);
        const seen = new Set<string>();
        for (const m of all) {
          if (!seen.has(m.family)) {
            seen.add(m.family);
            lmModels.push({ id: m.family, name: m.name ?? m.family });
          }
        }
      } catch {
        /* vscode.lm 不可用 */
      }
      const models = [...lmModels];
      const cfg = getStagentConfiguration();
      const apiKey = (cfg.get<string>('llmApiKey') ?? '').trim();
      const llmBaseUrl = cfg.get<string>('llmBaseUrl', 'https://api.openai.com/v1');
      const llmModel = cfg.get<string>('llmModel', 'gpt-4o');
      if (apiKey) {
        models.push({ id: `direct:${llmModel}`, name: uiMsg('stagent.sidebar.directApiModel', llmModel) });
      }
      const settingsProfile = readSettingsProfileId(cfg);
      const instance = engine.instances.getActiveInstance();
      const sandboxEnabled = readSandboxEnabled(cfg);
      const sandboxCapability = resolveSandboxCapability();
      return {
        models,
        preferredModel: engine.execution.getPreferredModelFamily(),
        stageInfo: engine.instances.getCurrentStageInfo() ?? null,
        retryStageOptions: instance ? buildRetryStageOptions(instance) : [],
        envStatus: {
          copilot: lmModels.length > 0,
          apiKey: apiKey.length > 0,
          llmBaseUrl,
          llmModel,
        },
        sandboxStatus: {
          enabled: sandboxEnabled,
          enforced: sandboxCapability.sandboxEnforced,
          platform: sandboxCapability.platform,
          detail: sandboxCapability.detail,
        },
        settingsProfile,
        profileHighlights: buildProfileHighlights(settingsProfile),
      };
    },
    (modelFamily) => {
      engine.execution.setPreferredModelFamily(modelFamily);
    },
    (stageId: string) => {
      if (!stageId) {
        void vscode.window.showWarningMessage(uiMsg('stagent.warn.noRetryStage'));
        return;
      }
      const panel = engine.execution.getActivePanel();
      if (!panel) {
        void vscode.window.showWarningMessage(uiMsg('stagent.warn.openPanelFirst'));
        return;
      }
      void engine.hitl
        .retry(stageId, '', panel)
        .then((result) => {
          if (!result.ok) {
            void vscode.window.showWarningMessage(sidebarRetryRejectToast(result));
          }
        })
        .catch((err) => {
          const mes = err instanceof Error ? err.message : String(err);
          void vscode.window.showErrorMessage(uiMsg('stagent.error.generic', mes));
        })
        .finally(() => refreshAiControls());
    },
    (query) => {
      void vscode.commands.executeCommand('workbench.action.openSettings', query);
    },
    (profileId) => {
      const cfg = getStagentConfiguration();
      const allowed: SettingsProfileId[] = ['default', 'strict', 'relaxed', 'minimal'];
      const id = allowed.includes(profileId as SettingsProfileId)
        ? (profileId as SettingsProfileId)
        : 'default';
      void cfg.update('settingsProfile', id, vscode.ConfigurationTarget.Global);
      runSettingsValidation();
    },
    (message) => {
      console.warn(`[Stagent] ai_controls_message_failed: ${message}`);
    },
  );
}
