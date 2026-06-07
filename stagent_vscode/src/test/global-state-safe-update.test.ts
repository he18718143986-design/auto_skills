import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { voidGlobalStateUpdate } from '../instance/GlobalStateSafeUpdate';

test('voidGlobalStateUpdate succeeds without warn on first attempt', async () => {
  const warnings: string[] = [];
  let calls = 0;
  voidGlobalStateUpdate(
    async () => {
      calls += 1;
    },
    (m) => warnings.push(m),
    'test-ok',
  );
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(calls, 1);
  assert.equal(warnings.length, 0);
});

test('voidGlobalStateUpdate retries then warns after max attempts', async () => {
  const warnings: string[] = [];
  let calls = 0;
  voidGlobalStateUpdate(
    async () => {
      calls += 1;
      throw new Error('disk busy');
    },
    (m) => warnings.push(m),
    'test-retry',
    { maxAttempts: 3, delayMs: 20 },
  );
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(calls, 3);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0]!, /global_state_update_failed context=test-retry/);
  assert.match(warnings[0]!, /attempt=3/);
  assert.match(warnings[0]!, /disk busy/);
});

test('voidGlobalStateUpdate invokes onFailure after max attempts', async () => {
  const warnings: string[] = [];
  const failures: string[] = [];
  voidGlobalStateUpdate(
    async () => {
      throw new Error('quota exceeded');
    },
    (m) => warnings.push(m),
    'test-on-failure',
    {
      maxAttempts: 2,
      delayMs: 10,
      onFailure: (ctx, err) => {
        failures.push(`${ctx}:${err instanceof Error ? err.message : String(err)}`);
      },
    },
  );
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(warnings.length, 1);
  assert.equal(failures.length, 1);
  assert.match(failures[0]!, /test-on-failure:quota exceeded/);
});
