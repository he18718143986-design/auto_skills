import './install-vscode-stub';
import * as assert from 'node:assert/strict';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import type { WorkflowInstance } from '../WorkflowDefinition';
import { WorkflowInstanceManager } from '../WorkflowInstanceManager';
import { WorkflowUiBridge } from '../WorkflowUiBridge';
import type { EngineHostFactoryDeps } from '../WorkflowEngineHostFactories';
import type { MessagingHost } from '../WorkflowEngineMessaging';

function mockUi(): WorkflowUiBridge {
  return new WorkflowUiBridge({
    messagingHost: (): MessagingHost => ({
      getInstance: () => undefined,
      getCurrentInstanceKey: () => undefined,
      getGlobalStorageFsPath: () => '/tmp',
      getExperiencePersistedForKey: () => undefined,
      setExperiencePersistedForKey: () => {},
      warn: () => {},
      debugLog: () => {},
      logUserAction: () => {},
    }),
    getFeedbackLastAsked: () => undefined,
    setFeedbackLastAsked: async () => {},
  });
}

function minimalHostFactoryDeps(mgr: WorkflowInstanceManager): EngineHostFactoryDeps {
  return {
    context: {
      globalStorageUri: { fsPath: path.join(os.tmpdir(), 'stagent-test-global') },
      extensionUri: { fsPath: path.join(os.tmpdir(), 'stagent-test-ext') },
      globalState: {
        keys: () => [],
        get: () => undefined,
        update: async () => undefined,
      },
    } as never,
    getInstance: () => mgr.lifecycle.getInstance(),
    setInstance: (i) => {
      mgr.instance = i;
    },
    getCurrentInstanceKey: () => mgr.lifecycle.getActiveInstanceKey(),
    setCurrentInstanceKey: (k) => {
      mgr.currentInstanceKey = k;
    },
    getExecutionDepth: () => 0,
    getExperiencePersistedForKey: () => mgr.experiencePersistedForKey,
    setExperiencePersistedForKey: (k) => {
      mgr.experiencePersistedForKey = k;
    },
    getPolishCache: () => new Map(),
    getGenerationSeq: () => 0,
    clearSaveTimer: () => mgr.persistence.clearSaveTimer(),
    bindPanel: () => {},
    postMessage: () => {},
    beginUiResync: () => {},
    postGenerationProgress: () => {},
    warn: () => {},
    degraded: () => {},
    error: () => {},
    debugLog: () => {},
    logUserAction: () => {},
    scheduleSave: () => mgr.persistence.scheduleSave(),
    persistMilestone: () => mgr.persistence.persistMilestone(),
    persistInstanceSnapshot: (key, inst) => mgr.persistence.persistInstanceSnapshot(key, inst),
    notifyInstancesChanged: () => {},
    workspaceFolderPath: () => undefined,
    resolveExistingDirectoryPath: () => ({ ok: false, reason: 'missing' }),
    expandUserHomePath: (raw) => raw,
    getDefaultTaskDir: () => '/tmp/task',
    resolveInitialTaskDirForStart: () => ({ ok: true, dir: '/tmp/task' }),
    loadInstanceByKey: () => undefined,
    deleteInstance: (key, scope) => mgr.catalog.deleteInstance(key, scope),
    resolveReuseInstance: (key) => mgr.catalog.resolveReuseInstance(key),
    ensurePreExecDraftShell: () => undefined,
    finalizeDraftDefinition: () => undefined,
    rejectApproveDecision: () => {},
    executeNextStage: async () => {},
    invokeLlmRaw: async () => '',
    parseWorkflowJson: async () => ({ id: 'wf', version: '2.0', meta: {} as never, stages: [] }),
    normalizeWorkflow: (wf) => wf,
    isGenerationSuperseded: () => false,
    polishCacheKey: () => 'k',
    rememberPolishCache: () => {},
    markStageArtifactsApproved: () => {},
    getWorkspaceRootAbsolute: () => undefined,
    resolveOutputPath: (_k, fp) => fp,
    ensureTaskDir: () => '/tmp/task',
    trackPersistedFile: () => {},
    maxStageWarn: 45,
  };
}

function createManager(
  ui: WorkflowUiBridge,
  context: EngineHostFactoryDeps['context'],
): WorkflowInstanceManager {
  const mgrHolder = { mgr: undefined as WorkflowInstanceManager | undefined };
  const mgr = new WorkflowInstanceManager({
    context,
    ui,
    warn: () => {},
    degraded: () => {},
    debugLog: () => {},
    getExecutionDepth: () => 0,
    executeNextStage: async () => {},
    expandUserHomePath: (r) => r,
    resolveExistingDirectoryPath: () => ({ ok: false, reason: 'x' }),
    workspaceFolderPath: () => undefined,
    hostFactoryDeps: () => minimalHostFactoryDeps(mgrHolder.mgr!),
  });
  mgrHolder.mgr = mgr;
  return mgr;
}

describe('WorkflowInstanceManager integration', () => {
  it('setActive and getActiveInstanceKey round-trip', () => {
    const ui = mockUi();
    const mgr = createManager(ui, {
      globalStorageUri: { fsPath: '/tmp' },
      extensionUri: { fsPath: '/tmp' },
      globalState: { keys: () => [], get: () => undefined, update: async () => undefined },
    } as never);
    mgr.setUi(ui);
    const inst: WorkflowInstance = {
      definition: {
        id: 'wf',
        version: '2.0',
        meta: { title: 't', taskType: 'software', userInput: '', createdAt: '' },
        stages: [],
      },
      currentStageIndex: 0,
      stageRuntimes: [],
      status: 'idle',
    };
    mgr.lifecycle.setActive('key-1', inst);
    assert.equal(mgr.lifecycle.getActiveInstanceKey(), 'key-1');
    assert.strictEqual(mgr.lifecycle.getInstance(), inst);
  });

  it('clearActive resets pointers', () => {
    const ui = mockUi();
    const mgr = createManager(ui, {
      globalStorageUri: { fsPath: '/tmp' },
      extensionUri: { fsPath: '/tmp' },
      globalState: { keys: () => [], get: () => undefined, update: async () => undefined },
    } as never);
    mgr.setUi(ui);
    mgr.lifecycle.setActive('k', {
      definition: { id: 'wf', version: '2.0', meta: { title: 't', taskType: 'software', userInput: '', createdAt: '' }, stages: [] },
      currentStageIndex: 0,
      stageRuntimes: [],
      status: 'idle',
    });
    mgr.lifecycle.clearActive();
    assert.equal(mgr.lifecycle.getActiveInstanceKey(), undefined);
    assert.equal(mgr.lifecycle.getInstance(), undefined);
  });

  it('resolveReuseInstance mints new id when no active instance', () => {
    const ui = mockUi();
    const mgr = createManager(ui, {
      globalStorageUri: { fsPath: path.join(os.tmpdir(), 'sg') },
      extensionUri: { fsPath: path.join(os.tmpdir(), 'ext') },
      globalState: { keys: () => [], get: () => undefined, update: async () => undefined },
    } as never);
    mgr.setUi(ui);
    const out = mgr.catalog.resolveReuseInstance(undefined);
    assert.equal(out.reuse, false);
    assert.ok(out.instanceId.length > 0);
  });
});
