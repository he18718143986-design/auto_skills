#!/usr/bin/env node
/**
 * 千文件级 codebase context 加载基准。
 * 用法：npm run benchmark:context -- [--files 1000]
 */
import { createSyntheticRepo } from './fixtures/synthetic-repo.mjs';

function parseFilesArg() {
  const idx = process.argv.indexOf('--files');
  if (idx >= 0 && process.argv[idx + 1]) {
    return Number(process.argv[idx + 1]);
  }
  return 1000;
}

async function main() {
  const fileCount = parseFilesArg();
  const root = createSyntheticRepo(fileCount);
  const { buildGeneratorCodebaseContextBlock } = await import('../../out/WorkflowGeneration.js');

  const started = Date.now();
  const result = buildGeneratorCodebaseContextBlock({
    taskWorkspaceAbs: root,
    userInput: 'benchmark synthetic repo',
    codebaseSnapshotEnabled: true,
    codebaseContextMaxTokens: 8000,
    onSnapshotDegraded: () => {},
    onDegraded: () => {},
  });
  const scanMs = Date.now() - started;
  const tokenEstimate = result.codebaseContext.length;
  const payload = {
    fileCount,
    scanMs,
    tokenEstimateChars: tokenEstimate,
    complexityEstimatedStages: result.complexity?.estimatedStageCount,
    depGraphNodes: result.depGraph?.nodes?.length ?? 0,
    snapshotLevel: result.codebaseSnapshot?.level,
  };
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
