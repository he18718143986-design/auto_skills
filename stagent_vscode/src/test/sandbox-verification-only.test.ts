import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { shouldSandboxCodeRunner } from '../sandbox/resolveSandboxForStage';
import { SMOKE_RUN_STAGE_ID } from '../disk-bootstrap/smokeStage';

const cfg = { type: 'code-runner' as const, command: 'npm test', captureOutput: true };

test('shouldSandboxCodeRunner respects verificationOnly', () => {
  assert.equal(
    shouldSandboxCodeRunner('stage_impl_x', cfg, { sandboxEnabled: true, verificationOnly: true }),
    false,
  );
  assert.equal(
    shouldSandboxCodeRunner('stage_test_run_unit', cfg, {
      sandboxEnabled: true,
      verificationOnly: true,
    }),
    true,
  );
  assert.equal(
    shouldSandboxCodeRunner(SMOKE_RUN_STAGE_ID, cfg, { sandboxEnabled: true, verificationOnly: true }),
    true,
  );
  assert.equal(
    shouldSandboxCodeRunner('stage_impl_x', cfg, { sandboxEnabled: true, verificationOnly: false }),
    true,
  );
});
