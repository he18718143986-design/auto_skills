import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatStageErrorForUser, lookupStageErrorCatalog } from '../StageErrorCatalog';

describe('StageErrorCatalog', () => {
  const types = [
    'tool-execution-failed',
    'code-runner-timeout',
    'invariant-violation',
    'llm-timeout',
    'llm-invalid-output',
    'retry-limit-exceeded',
    'file-not-found',
    'confidence-too-low',
    'sandbox-network-blocked',
    'sandbox-memory-exceeded',
  ] as const;

  for (const t of types) {
    it(`covers ${t}`, () => {
      const entry = lookupStageErrorCatalog(t);
      assert.ok(entry);
      assert.ok(entry!.titleKey.startsWith('stagent.error.catalog.'));
      assert.ok(entry!.titleKey.endsWith('.title'));
      if (entry!.playbookKeys?.length) {
        for (const pk of entry!.playbookKeys) {
          assert.match(pk, /^stagent\.error\.catalog\./);
        }
      }
      const formatted = formatStageErrorForUser(t, 'raw detail');
      assert.ok(formatted.title.length > 0);
      assert.match(formatted.body, /raw detail/);
    });
  }

  it('tool-execution-failed exitCode=127 enriches environment copy', () => {
    const formatted = formatStageErrorForUser(
      'tool-execution-failed',
      'tool-execution-failed: code-runner exitCode=127',
      { stderr: 'flutter: command not found', stageId: 'stage_test_run_chat_ui' },
    );
    assert.equal(formatted.userCategory, 'environment');
    assert.equal(formatted.exitCode, 127);
    assert.equal(formatted.weakenRetry, true);
    assert.ok(formatted.userBody && formatted.userBody.length > 0);
    assert.notEqual(formatted.userBody, formatted.body);
  });

  it('tool-execution-failed exitCode=1 enriches code copy', () => {
    const formatted = formatStageErrorForUser(
      'tool-execution-failed',
      'tool-execution-failed: code-runner exitCode=1',
      { stageId: 'stage_test_run_chat_integration' },
    );
    assert.equal(formatted.userCategory, 'code');
    assert.equal(formatted.exitCode, 1);
    assert.equal(formatted.weakenRetry, false);
  });
});
