import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { EngineHostFactoryDeps } from '../WorkflowEngineHostFactories';
import { WorkflowEngineHostRegistry } from '../WorkflowEngineHostRegistry';
import { createWorkflowEngineParts } from '../engine-wiring/createWorkflowEngineParts';

function makeMockContext() {
  const baseDir = path.join(process.cwd(), '.test-tmp', 'headless-construct');
  fs.mkdirSync(baseDir, { recursive: true });
  const globalStorageDir = fs.mkdtempSync(path.join(baseDir, 'storage-'));
  const extensionDir = fs.mkdtempSync(path.join(baseDir, 'ext-'));
  const globalState = new Map<string, unknown>();

  return {
    context: {
      globalStorageUri: { fsPath: globalStorageDir },
      extensionUri: { fsPath: extensionDir },
      globalState: {
        get: <T>(key: string, defaultValue?: T) =>
          (globalState.get(key) as T | undefined) ?? defaultValue,
        update: async (key: string, value: unknown) => {
          if (value === undefined) {
            globalState.delete(key);
          } else {
            globalState.set(key, value);
          }
        },
        keys: () => [...globalState.keys()],
      },
      subscriptions: { push: () => {} },
    } as never,
    cleanup: () => {
      fs.rmSync(globalStorageDir, { recursive: true, force: true });
      fs.rmSync(extensionDir, { recursive: true, force: true });
    },
  };
}

function minimalHostFactoryDeps(): EngineHostFactoryDeps {
  return {
    context: {} as never,
    maxStageWarn: 50,
    getGenerationSeq: () => 0,
    getInstance: () => undefined,
    setInstance: () => {},
    getCurrentInstanceKey: () => undefined,
    setCurrentInstanceKey: () => {},
    getExecutionDepth: () => 0,
    getExperiencePersistedForKey: () => undefined,
    setExperiencePersistedForKey: () => {},
    getPolishCache: () => new Map(),
    clearSaveTimer: () => {},
    bindPanel: () => {},
    postMessage: () => {},
    beginUiResync: () => {},
    postGenerationProgress: () => {},
    warn: () => {},
    degraded: () => {},
    error: () => {},
    debugLog: () => {},
    logUserAction: () => {},
    scheduleSave: () => {},
    persistMilestone: () => {},
    persistInstanceSnapshot: () => {},
    notifyInstancesChanged: () => {},
    workspaceFolderPath: () => undefined,
    resolveExistingDirectoryPath: () => ({ ok: false, reason: 'test' }),
    expandUserHomePath: (raw) => raw,
    getDefaultTaskDir: () => '/tmp',
    resolveInitialTaskDirForStart: () => ({ ok: false, reason: 'test' }),
    loadInstanceByKey: () => undefined,
    deleteInstance: () => {},
    resolveReuseInstance: () => ({ reuse: false, instanceId: 'test' }),
    ensurePreExecDraftShell: () => undefined,
    finalizeDraftDefinition: () => undefined,
    rejectApproveDecision: () => {},
    executeNextStage: async () => {},
    invokeLlmRaw: async () => '',
    parseWorkflowJson: async () => ({ stages: [] } as never),
    normalizeWorkflow: (wf) => wf,
    isGenerationSuperseded: () => false,
    polishCacheKey: () => '',
    rememberPolishCache: () => {},
    markStageArtifactsApproved: () => {},
    getWorkspaceRootAbsolute: () => undefined,
    resolveOutputPath: () => '',
    ensureTaskDir: () => '/tmp',
    trackPersistedFile: () => {},
  };
}

test('createWorkflowEngineParts constructs all parts without VS Code runtime services', () => {
  const { context, cleanup } = makeMockContext();
  try {
    const parts = createWorkflowEngineParts(context);
    assert.ok(parts.state);
    assert.ok(parts.ui);
    assert.ok(parts.instanceManager);
    assert.ok(parts.generationService);
    assert.ok(parts.lifecycle);
    assert.ok(parts.llm);
    assert.ok(parts.diagnostics);
    assert.ok(parts.hostRegistry);
    assert.ok(parts.internals);
    assert.ok(parts.facades.instances);
    assert.ok(parts.facades.generation);
    assert.ok(parts.facades.execution);
    assert.ok(parts.facades.hitl);
    assert.ok(parts.facades.artifacts);
    assert.equal(typeof parts.facades.execution.executeNextStage, 'function');
  } finally {
    cleanup();
  }
});

test('WorkflowEngineHostRegistry caches host instances across repeated calls', () => {
  let depsCalls = 0;
  const registry = new WorkflowEngineHostRegistry(
    () => {
      depsCalls += 1;
      return minimalHostFactoryDeps();
    },
    { invoke: async () => '' } as never,
    () => {},
    () => {},
    () => {},
    () => {},
    () => {},
    () => true,
  );

  const pathA = registry.pathHost();
  const pathB = registry.pathHost();
  assert.equal(pathA, pathB, 'pathHost should return cached instance');

  const hitlA = registry.hitlHost();
  const hitlB = registry.hitlHost();
  assert.equal(hitlA, hitlB, 'hitlHost should return cached instance');

  const startA = registry.startExecutionHost();
  const startB = registry.startExecutionHost();
  assert.equal(startA, startB, 'startExecutionHost should return cached instance');

  const artifactA = registry.artifactUiHost();
  const artifactB = registry.artifactUiHost();
  assert.equal(artifactA, artifactB, 'artifactUiHost should return cached instance');

  assert.equal(depsCalls, 1, 'deps factory should run once for all cached hosts');
});
