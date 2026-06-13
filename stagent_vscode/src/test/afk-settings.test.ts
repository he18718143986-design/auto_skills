import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { readCharterAutoAnswerMode, readCharterFeedbackAutoWrite } from '../settings/readers/charter';
import { readConfidencePauseThreshold } from '../settings/readers/hitl';
import { readVerificationFlakyRerunCount } from '../settings/readers/verification';
import {
  readGateAutoRepairEnabled,
  readPythonExportContractLintMode,
  readPythonPypiSymbolLintMode,
  readSandboxVerificationOnly,
} from '../settings/readers/exec';

function mockCfg(values: Record<string, unknown>) {
  return {
    get: <T>(key: string) => values[key] as T | undefined,
    inspect: (key: string) => {
      if (!(key in values)) {
        return undefined;
      }
      return { workspaceValue: values[key] };
    },
  };
}

test('AFK preset applies bundle defaults when keys not explicit', () => {
  const cfg = mockCfg({ 'afk.enabled': true });
  assert.equal(readCharterAutoAnswerMode(cfg as never), 'auto-with-escalation');
  assert.equal(readCharterFeedbackAutoWrite(cfg as never), true);
  assert.equal(readConfidencePauseThreshold(cfg as never), 0.35);
  assert.equal(readVerificationFlakyRerunCount(cfg as never), 3);
  assert.equal(readSandboxVerificationOnly(cfg as never), true);
});

test('AFK preset forces python contract lints to hard when not explicit', () => {
  const cfg = mockCfg({ 'afk.enabled': true });
  assert.equal(readPythonExportContractLintMode(cfg as never), 'hard');
  assert.equal(readPythonPypiSymbolLintMode(cfg as never), 'hard');
  assert.equal(readGateAutoRepairEnabled(cfg as never), true);
});

test('AFK preset does not override explicit python.exportContractLint', () => {
  const cfg = mockCfg({
    'afk.enabled': true,
    'python.exportContractLint': 'warn',
  });
  assert.equal(readPythonExportContractLintMode(cfg as never), 'warn');
});

test('AFK preset does not override explicit charter.autoAnswerMode', () => {
  const cfg = mockCfg({
    'afk.enabled': true,
    'charter.autoAnswerMode': 'suggest',
  });
  assert.equal(readCharterAutoAnswerMode(cfg as never), 'suggest');
});
