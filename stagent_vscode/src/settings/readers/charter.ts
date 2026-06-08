import type * as vscode from 'vscode';
import type { CharterAutoAnswerMode } from '../../charter/CharterTypes';
import { DEFAULT_CHARTER_RELATIVE_PATH } from '../../charter/CharterLoader';
import {
  readConfigBooleanDefaultTrue,
  readConfigStringEnum,
} from './readConfigHelpers';

/** vscode `stagent.charter.enabled`；B-R2，默认 true（无 charter 文件时不注入）。 */
export function readCharterEnabled(cfg?: vscode.WorkspaceConfiguration): boolean {
  return readConfigBooleanDefaultTrue(cfg, 'charter.enabled');
}

/** vscode `stagent.charter.autoAnswerMode`；默认 off（对齐 PRD §6.6.2 MVP）。 */
export function readCharterAutoAnswerMode(cfg?: vscode.WorkspaceConfiguration): CharterAutoAnswerMode {
  return readConfigStringEnum(
    cfg,
    'charter.autoAnswerMode',
    ['off', 'suggest', 'auto-with-escalation'] as const,
    'off',
  );
}

/** vscode `stagent.charter.path`；相对工作区根，默认 docs/agents/charter.md。 */
export function readCharterRelativePath(cfg?: vscode.WorkspaceConfiguration): string {
  const raw = cfg?.get<string>('charter.path');
  if (typeof raw === 'string' && raw.trim()) {
    return raw.trim();
  }
  return DEFAULT_CHARTER_RELATIVE_PATH;
}

/** vscode `stagent.charter.feedbackEnabled`；B-R2γ session 结束提示回写，默认 true。 */
export function readCharterFeedbackEnabled(cfg?: vscode.WorkspaceConfiguration): boolean {
  return readConfigBooleanDefaultTrue(cfg, 'charter.feedbackEnabled');
}

/** vscode `stagent.charter.feedbackCooldownDays`；0=每次有候选即提示。 */
export function readCharterFeedbackCooldownDays(cfg?: vscode.WorkspaceConfiguration): number {
  const raw = cfg?.get<number>('charter.feedbackCooldownDays');
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
    return raw;
  }
  return 0;
}
