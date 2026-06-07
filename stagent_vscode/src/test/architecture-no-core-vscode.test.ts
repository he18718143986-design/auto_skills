import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');

const ENGINE_CORE_DIRS = [
  'src/engine-wiring',
  'src/engine-facades',
  'src/engine-host',
  'src/executor-loop',
  'src/execution-bindings',
  'src/quality-gates',
  'src/input-context',
  'src/instance-repo',
];

const ENGINE_CORE_FILES = [
  'src/WorkflowEngine.ts',
  'src/WorkflowEngineInternals.ts',
  'src/WorkflowEngineHostRegistry.ts',
  'src/WorkflowEngineHostFactories.ts',
  'src/EngineHostFactoryBuilder.ts',
  'src/EngineDiagnosticsOps.ts',
  'src/EngineExecutionRunner.ts',
  'src/WorkflowEngineExecutionBinder.ts',
  'src/WorkflowEngineMessaging.ts',
  'src/WorkflowEngineSettingsReaders.ts',
  'src/WorkflowEnginePersistenceBridge.ts',
  'src/WorkflowInstanceManager.ts',
  'src/WorkflowGenerationService.ts',
  'src/WorkflowExecutorLoop.ts',
  'src/WorkflowExecutor.ts',
  'src/start/index.ts',
  'src/settings/getStagentConfiguration.ts',
];

const RUNTIME_VSCODE_IMPORT = /^\s*import\s+\*\s+as\s+vscode\s+from\s+['"]vscode['"]/m;

function collectTsFiles(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  const out: string[] = [];
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectTsFiles(rel));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      out.push(rel);
    }
  }
  return out;
}

function engineCorePaths(): string[] {
  const files = new Set<string>(ENGINE_CORE_FILES);
  for (const dir of ENGINE_CORE_DIRS) {
    for (const file of collectTsFiles(dir)) {
      files.add(file);
    }
  }
  return [...files].sort();
}

test('engine core paths do not use runtime import * as vscode', () => {
  const violations: string[] = [];
  for (const rel of engineCorePaths()) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    if (RUNTIME_VSCODE_IMPORT.test(src)) {
      violations.push(rel);
    }
  }
  assert.deepEqual(
    violations,
    [],
    `runtime vscode imports found in engine core:\n${violations.map((v) => `  - ${v}`).join('\n')}`,
  );
});
