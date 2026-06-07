import type * as vscode from 'vscode';
import {
  PROFILE_DIFF_HINTS_MAX,
  PROFILE_DIFF_ITEMS_MAX,
  PROFILE_DIFF_LINES_MAX,
} from './UiListLimits';
import {
  getSettingsProfile,
  getSettingsProfileOverrides,
  type SettingsProfileId,
} from './StagentSettingsProfiles';

const GATE_KEYS: { key: string; label: string; format?: 'mode' | 'bool' }[] = [
  { key: 'tdd.redGreenGate', label: 'TDD 红绿门', format: 'mode' },
  { key: 'debug.requireFeedbackLoop', label: 'Debug 反馈回路', format: 'mode' },
  { key: 'execution.sdkPathContractLint', label: 'SDK 路径契约', format: 'mode' },
  { key: 'plan.requireCompleteness', label: '计划完整性', format: 'bool' },
  { key: 'plan.structuralRepair', label: '计划结构修复', format: 'mode' },
  { key: 'enableRuntimeRule20Verify', label: '运行时 Rule20', format: 'bool' },
  { key: 'experience.injectOnGenerate', label: '生成时经验注入', format: 'bool' },
];

function formatGateValue(key: string, value: unknown): string {
  if (value === true) {
    return '开启';
  }
  if (value === false) {
    return '关闭';
  }
  return String(value);
}

/** 相对 default Profile 的门禁差异（用于确认页 / 侧栏摘要）。 */
export function buildProfileGateDiff(profileId: SettingsProfileId | string): string[] {
  const id = normalizeProfileId(profileId);
  if (id === 'default') {
    return [];
  }
  const overrides = getSettingsProfileOverrides(id);
  const lines: string[] = [];
  for (const { key, label } of GATE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(overrides, key)) {
      continue;
    }
    const val = overrides[key];
    lines.push(`${label}：${formatGateValue(key, val)}（Profile ${id}）`);
  }
  const spec = getSettingsProfile(id);
  if (lines.length === 0) {
    return [spec.description];
  }
  return lines.slice(0, PROFILE_DIFF_LINES_MAX);
}

/** 合并 highlights + 相对 default 的门禁 diff。 */
export function buildProfileSummaryForUi(profileId: SettingsProfileId | string): string[] {
  const id = normalizeProfileId(profileId);
  const spec = getSettingsProfile(id);
  const diff = buildProfileGateDiff(id);
  if (id === 'default') {
    return [spec.description, ...diff].slice(0, PROFILE_DIFF_ITEMS_MAX);
  }
  return [`${spec.label}：${spec.description}`, ...diff].slice(0, PROFILE_DIFF_LINES_MAX);
}

function normalizeProfileId(profileId: string): SettingsProfileId {
  if (profileId === 'strict' || profileId === 'relaxed' || profileId === 'minimal') {
    return profileId;
  }
  return 'default';
}

/** 显式配置相对所选 Profile 建议值的漂移（短句，供确认页）。 */
export function buildProfileDriftHints(
  profileId: SettingsProfileId | string,
  cfg?: vscode.WorkspaceConfiguration,
): string[] {
  const id = normalizeProfileId(profileId);
  if (!cfg || id === 'default') {
    return [];
  }
  const overrides = getSettingsProfileOverrides(id);
  const hints: string[] = [];
  for (const [key, expected] of Object.entries(overrides)) {
    const actual = cfg.get(key);
    if (actual !== undefined && actual !== expected) {
      hints.push(`已覆盖 Profile 建议：${key}=${JSON.stringify(actual)}`);
    }
  }
  return hints.slice(0, PROFILE_DIFF_HINTS_MAX);
}
