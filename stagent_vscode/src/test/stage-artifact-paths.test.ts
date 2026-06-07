import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  collectArtifactPathsFromStages,
  getStageArtifactPath,
  listStageArtifactPathEntries,
  normalizeArtifactRelativePath,
} from '../workflow/stageArtifactPaths';
import { countStagesByKind } from '../workflow/StageKindCounts';

test('normalizeArtifactRelativePath normalizes slashes and dot prefix', () => {
  assert.equal(normalizeArtifactRelativePath('.\\foo\\bar.py'), 'foo/bar.py');
  assert.equal(normalizeArtifactRelativePath('./reader.py'), 'reader.py');
});

test('getStageArtifactPath extracts llm-text and file paths', () => {
  assert.equal(
    getStageArtifactPath({
      tool: 'llm-text',
      toolConfig: { writeOutputToFile: 'reader.py' },
    }),
    'reader.py',
  );
  assert.equal(
    getStageArtifactPath({
      tool: 'file-write',
      toolConfig: { filePath: './config.yaml' },
    }),
    'config.yaml',
  );
  assert.equal(getStageArtifactPath({ tool: 'code-runner', toolConfig: {} }), undefined);
});

test('collectArtifactPathsFromStages dedupes and sorts', () => {
  const paths = collectArtifactPathsFromStages([
    { tool: 'llm-text', toolConfig: { writeOutputToFile: 'b.py' } },
    { tool: 'llm-text', toolConfig: { writeOutputToFile: 'a.py' } },
    { tool: 'llm-text', toolConfig: { writeOutputToFile: 'b.py' } },
  ]);
  assert.deepEqual(paths, ['a.py', 'b.py']);
});

test('listStageArtifactPathEntries includes pathBase for typed toolConfig', () => {
  assert.deepEqual(
    listStageArtifactPathEntries({
      tool: 'llm-text',
      toolConfig: {
        type: 'llm-text',
        writeOutputToFile: './out.md',
        writePathBase: 'workspace',
      },
    }),
    [{ relativePath: 'out.md', pathBase: 'workspace' }],
  );
});

test('countStagesByKind tallies decision, impl, test_run, pause', () => {
  const counts = countStagesByKind([
    { id: 'stage_decide_x', isDecisionStage: true, pauseAfter: true },
    { id: 'stage_impl_a', pauseAfter: false },
    { id: 'stage_test_run_x', pauseAfter: false },
  ]);
  assert.equal(counts.stageCount, 3);
  assert.equal(counts.decisionCount, 1);
  assert.equal(counts.implCount, 1);
  assert.equal(counts.testRunCount, 1);
  assert.equal(counts.pauseCount, 1);
});
