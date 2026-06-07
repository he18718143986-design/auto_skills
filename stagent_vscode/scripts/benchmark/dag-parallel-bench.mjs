#!/usr/bin/env node
/**
 * DAG 并行 vs 串行 wall-clock 基准。
 * 用法：npm run benchmark:dag
 * 需先 npm run test:compile
 */
const minSpeedup = Number(process.env.STAGENT_BENCH_MIN_SPEEDUP ?? '1.5');

async function main() {
  const { runDagParallelBenchmark } = await import('../../out/test/helpers/dagBenchHarness.js');
  const result = await runDagParallelBenchmark({ stageDelayMs: 8, dagMaxParallelism: 4 });
  console.log(JSON.stringify(result, null, 2));
  if (result.speedup < minSpeedup) {
    console.error(`speedup ${result.speedup.toFixed(2)} < threshold ${minSpeedup}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
