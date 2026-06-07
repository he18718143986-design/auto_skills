import * as assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { test } from 'node:test';

test('check-message-handlers script passes on repo', () => {
  const script = path.join(process.cwd(), 'scripts/check-message-handlers.mjs');
  const result = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  if (result.status !== 0) {
    assert.fail(
      `check-message-handlers failed:\n${result.stdout}\n${result.stderr}`,
    );
  }
  assert.match(result.stdout ?? '', /OK/);
});
