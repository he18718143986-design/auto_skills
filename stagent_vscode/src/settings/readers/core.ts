import type * as vscode from 'vscode';
import type { SettingsProfileId } from '../../StagentSettingsProfiles';
import { readConfigStringEnum } from './readConfigHelpers';

/** vscode `stagent.settingsProfile`；M43，默认 default（strict/relaxed/minimal 为文档化预设参考） */
export function readSettingsProfileId(cfg?: vscode.WorkspaceConfiguration): SettingsProfileId {
  return readConfigStringEnum(
    cfg,
    'settingsProfile',
    ['strict', 'relaxed', 'minimal', 'default'] as const,
    'default',
  );
}
