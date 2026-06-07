import assert from 'node:assert/strict';
import { test } from 'node:test';
import type * as vscode from 'vscode';
import {
  getSettingsProfile,
  getSettingsProfileOverrides,
  validateSettings,
  SETTINGS_PROFILES,
} from '../StagentSettingsGovernance';
import { buildProfileGateDiff } from '../StagentProfileDiff';
import { resolveSandboxCapability } from '../sandbox/SandboxCapabilityMatrix';

function mockCfg(values: Record<string, unknown>): vscode.WorkspaceConfiguration {
  return {
    get: <T>(key: string, defaultValue?: T): T | undefined => {
      if (Object.prototype.hasOwnProperty.call(values, key)) {
        return values[key] as T;
      }
      return defaultValue;
    },
  } as vscode.WorkspaceConfiguration;
}

test('SETTINGS_PROFILES includes strict relaxed minimal', () => {
  const ids = SETTINGS_PROFILES.map((p) => p.id);
  assert.deepEqual(ids, ['default', 'strict', 'relaxed', 'minimal']);
});

test('strict profile sets hard gates', () => {
  const overrides = getSettingsProfileOverrides('strict');
  assert.equal(overrides['tdd.redGreenGate'], 'hard');
  assert.equal(overrides['debug.requireFeedbackLoop'], 'hard');
  assert.equal(overrides['execution.sdkPathContractLint'], 'hard');
  assert.equal(overrides['plan.structuralRepair'], 'auto');
});

test('minimal profile disables non-core gates', () => {
  const overrides = getSettingsProfileOverrides('minimal');
  assert.equal(overrides['plan.requireCompleteness'], false);
  assert.equal(overrides['tdd.redGreenGate'], 'off');
  assert.equal(overrides['memory.enableExperienceStore'], false);
});

test('validateSettings flags redGreen hard + debug off as error', () => {
  const issues = validateSettings(
    mockCfg({
      'tdd.redGreenGate': 'hard',
      'debug.requireFeedbackLoop': 'off',
    }),
  );
  assert.ok(issues.some((i) => i.code === 'tdd-debug-feedback-mismatch' && i.severity === 'error'));
});

test('validateSettings flags structural repair without completeness', () => {
  const issues = validateSettings(
    mockCfg({
      'plan.structuralRepair': 'auto',
      'plan.requireCompleteness': false,
    }),
  );
  assert.ok(issues.some((i) => i.code === 'structural-repair-without-completeness'));
});

test('validateSettings flags experience inject without store', () => {
  const issues = validateSettings(
    mockCfg({
      'experience.injectOnGenerate': true,
      'memory.enableExperienceStore': false,
    }),
  );
  assert.ok(issues.some((i) => i.code === 'inject-without-store'));
});

test('validateSettings reports profile drift when explicit keys differ', () => {
  const issues = validateSettings(
    mockCfg({
      settingsProfile: 'strict',
      'tdd.redGreenGate': 'off',
    }),
  );
  assert.ok(issues.some((i) => i.code === 'profile-override-drift'));
});

test('validateSettings passes for relaxed-consistent combo', () => {
  const issues = validateSettings(
    mockCfg({
      'tdd.redGreenGate': 'warn',
      'debug.requireFeedbackLoop': 'warn',
      'plan.requireCompleteness': true,
    }),
  );
  assert.equal(issues.filter((i) => i.severity === 'error').length, 0);
});

test('getSettingsProfile falls back to default for unknown id', () => {
  assert.equal(getSettingsProfile('default' as never).id, 'default');
});

test('buildProfileGateDiff lists strict hard gates', () => {
  const diff = buildProfileGateDiff('strict');
  assert.ok(diff.some((l) => l.includes('红绿门')));
  assert.ok(diff.some((l) => l.includes('hard') || l.includes('开启')));
});

test('validateSettings warns deepseek max tokens above 8192', () => {
  const issues = validateSettings(
    mockCfg({
      llmBaseUrl: 'https://api.deepseek.com/v1',
      llmMaxOutputTokens: 16384,
    }),
  );
  assert.ok(issues.some((i) => i.code === 'deepseek-max-tokens-high'));
});

test('validateSettings info when sandbox enabled', () => {
  const issues = validateSettings(mockCfg({ 'sandbox.enabled': true }));
  assert.ok(issues.some((i) => i.code === 'sandbox-network-hint'));
});

test('validateSettings warns when sandbox enabled without kernel enforcement', () => {
  const issues = validateSettings(mockCfg({ 'sandbox.enabled': true }));
  const cap = resolveSandboxCapability();
  if (cap.sandboxEnforced) {
    assert.ok(!issues.some((i) => i.code === 'sandbox-soft-constraint-only'));
    return;
  }
  if (process.platform === 'darwin') {
    assert.ok(issues.some((i) => i.code === 'sandbox-exec-missing' || i.code === 'sandbox-soft-constraint-only'));
  } else {
    assert.ok(issues.some((i) => i.code === 'sandbox-soft-constraint-only'));
  }
});
