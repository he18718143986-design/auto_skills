import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildGeneratorCodebaseContextBlock } from '../WorkflowGeneration';

function createSyntheticRepo(fileCount: number): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stagent-ctx-bench-'));
  const src = path.join(root, 'src');
  fs.mkdirSync(src, { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'bench', private: true }));
  for (let i = 0; i < fileCount; i++) {
    const sub = path.join(src, `d${Math.floor(i / 50)}`);
    fs.mkdirSync(sub, { recursive: true });
    fs.writeFileSync(path.join(sub, `f${i}.ts`), `export const x${i}=${i};\n`);
  }
  return root;
}

test('context load benchmark: 1000-file synthetic repo completes within budget', () => {
  const root = createSyntheticRepo(1000);
  const started = Date.now();
  const result = buildGeneratorCodebaseContextBlock({
    taskWorkspaceAbs: root,
    userInput: 'load test',
    codebaseSnapshotEnabled: true,
    codebaseContextMaxTokens: 8000,
    onSnapshotDegraded: () => {},
    onDegraded: () => {},
  });
  const scanMs = Date.now() - started;
  assert.ok(scanMs < 30_000, `scan took ${scanMs}ms`);
  assert.ok(result.codebaseContext.length > 0);
  assert.ok(result.complexity);
  fs.rmSync(root, { recursive: true, force: true });
});
