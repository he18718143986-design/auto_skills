import type * as vscode from 'vscode';
import { readConfigBooleanDefaultTrue } from './readConfigHelpers';
import { readAfkEnabled, settingExplicitlyConfigured } from './afk';

/** vscode `stagent.friendly.milestoneVerifyHint`；B-R3 G4，默认 true。 */
export function readFriendlyMilestoneVerifyHint(cfg?: vscode.WorkspaceConfiguration): boolean {
  if (readAfkEnabled(cfg) && !settingExplicitlyConfigured(cfg, 'friendly.milestoneVerifyHint')) {
    return false;
  }
  return readConfigBooleanDefaultTrue(cfg, 'friendly.milestoneVerifyHint');
}
