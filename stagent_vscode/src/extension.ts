import type * as vscode from 'vscode';
import { registerBuiltinQualityGates } from './BuiltinQualityGates';
import { setSelfHealGapDetector } from './plan-completeness/selfHealGapDetector';
import { auditSelfHealGaps } from './workflow-self-heal/injectSelfHealStages';
import { bootstrapExtensionSettings } from './ExtensionSettingsBootstrap';
import { registerExtensionCommands } from './ExtensionCommands';
import { runStagentOnboardingIfNeeded } from './StagentOnboarding';
import {
  bootstrapStagentSidebar,
  offerRecoverableInstance,
} from './StagentSidebarBootstrap';
import { createExtensionRuntime } from './extension/ExtensionRuntime';
import { WorkflowEngine } from './WorkflowEngine';
import { createWorkflowPanelFactory } from './WorkflowPanelFactory';
import { setExtensionRootForScripts } from './contract-infra';

export function activate(context: vscode.ExtensionContext): void {
  setExtensionRootForScripts(context.extensionPath);
  registerBuiltinQualityGates(undefined, (reason, ctx) =>
    console.warn(`[Stagent] ${reason}: ${JSON.stringify(ctx ?? {})}`),
  );
  setSelfHealGapDetector(auditSelfHealGaps);
  bootstrapExtensionSettings(context);

  const engine = new WorkflowEngine(context);
  void runStagentOnboardingIfNeeded(context).catch((e) => {
    console.warn(
      `[Stagent] onboarding_failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  });

  let refreshAiControls = (): void => {};
  const panelFactory = createWorkflowPanelFactory(context, engine, () => {
    refreshAiControls();
  });

  const sidebar = bootstrapStagentSidebar(context, engine, panelFactory);
  refreshAiControls = sidebar.refreshAiControls;
  const runtime = createExtensionRuntime(engine, panelFactory, refreshAiControls);

  sidebar.taskListProvider.refresh();
  offerRecoverableInstance(runtime.engine, runtime.panelFactory, runtime.refreshAiControls);

  registerExtensionCommands(context, runtime, () => {
    runtime.panelFactory.getOrCreateWorkflowPanel();
  });
}

export function deactivate(): void {}
