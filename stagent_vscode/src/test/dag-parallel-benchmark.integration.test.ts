import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { runDagParallelBenchmark } from './helpers/dagBenchHarness';

test('dag parallel benchmark: parallel DAG faster than sequential for fan-out fixture', async () => {
  const minSpeedup = Number(process.env.STAGENT_BENCH_MIN_SPEEDUP ?? '1.2');
  const result = await runDagParallelBenchmark({ stageDelayMs: 6, dagMaxParallelism: 4 });
  assert.ok(result.parallelMs > 0);
  assert.ok(result.sequentialMs > 0);
  assert.equal(result.stageCount, 8);
  assert.ok(
    result.speedup >= minSpeedup,
    `expected speedup >= ${minSpeedup}, got ${result.speedup.toFixed(2)} (parallel=${result.parallelMs}ms sequential=${result.sequentialMs}ms)`,
  );
});
