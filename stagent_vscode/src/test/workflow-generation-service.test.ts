import './install-vscode-stub';
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { WorkflowDefinition } from '../WorkflowDefinition';
import { WorkflowGenerationService } from '../WorkflowGenerationService';
import { WorkflowUiBridge } from '../WorkflowUiBridge';
import type { EngineHostFactoryDeps } from '../WorkflowEngineHostFactories';
import type { MessagingHost } from '../WorkflowEngineMessaging';

function mockUi(posted: unknown[]): WorkflowUiBridge {
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
    getCharterFeedbackLastAsked: () => undefined,
    setCharterFeedbackLastAsked: async () => {},
  });
}

function hostFactory(posted: unknown[], generation: WorkflowGenerationService): EngineHostFactoryDeps {
  return {
    context: { globalStorageUri: { fsPath: '/tmp' }, extensionUri: { fsPath: '/tmp' }, globalState: { keys: () => [], get: () => undefined, update: async () => undefined } } as never,
    getInstance: () => undefined,
    setInstance: () => {},
    getCurrentInstanceKey: () => undefined,
    setCurrentInstanceKey: () => {},
    getExecutionDepth: () => 0,
    getExperiencePersistedForKey: () => undefined,
    setExperiencePersistedForKey: () => {},
    getPolishCache: () => generation.getPolishCache(),
    getGenerationSeq: () => generation.getGenerationSeq(),
    clearSaveTimer: () => {},
    bindPanel: () => {},
    postMessage: (_p, msg) => posted.push(msg),
    beginUiResync: () => {},
    postGenerationProgress: (_p, _op, _ph, msg) => posted.push({ type: 'generationProgress', message: msg }),
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
    resolveExistingDirectoryPath: () => ({ ok: false, reason: 'dir missing' }),
    expandUserHomePath: (r) => r,
    getDefaultTaskDir: () => '/tmp',
    resolveInitialTaskDirForStart: () => ({ ok: true, dir: '/tmp' }),
    loadInstanceByKey: () => undefined,
    deleteInstance: () => {},
    resolveReuseInstance: () => ({ reuse: false, instanceId: 'new' }),
    ensurePreExecDraftShell: () => 'shell-key',
    finalizeDraftDefinition: () => 'draft-key',
    rejectApproveDecision: () => {},
    executeNextStage: async () => {},
    invokeLlmRaw: async () => '{"id":"wf","version":"2.0","meta":{"title":"t","taskType":"software","userInput":"x","createdAt":"2020"},"stages":[]}',
    parseWorkflowJson: async (raw) => JSON.parse(raw) as WorkflowDefinition,
    normalizeWorkflow: (wf, _u, _t) => wf,
    isGenerationSuperseded: (myGen) => generation.isGenerationSuperseded(myGen),
    polishCacheKey: (d, t) => generation.polishCacheKey(d, t),
    rememberPolishCache: (k, text, at) => generation.rememberPolishCache(k, text, at),
    markStageArtifactsApproved: () => {},
    getWorkspaceRootAbsolute: () => undefined,
    resolveOutputPath: (_k, fp) => fp,
    ensureTaskDir: () => '/tmp',
    trackPersistedFile: () => {},
    maxStageWarn: 45,
  };
}

describe('WorkflowGenerationService integration', () => {
  it('bumpGenerationSeq increments and isGenerationSuperseded detects stale gen', () => {
    const posted: unknown[] = [];
    const ui = mockUi(posted);
    const svcHolder = { svc: undefined as WorkflowGenerationService | undefined };
    const svc = new WorkflowGenerationService({
      ui,
      hostFactoryDeps: () => hostFactory(posted, svcHolder.svc!),
      invokeLlmRaw: async () => '',
      pickZoomOutFilePath: () => 'README.md',
      debugLog: () => {},
      degraded: () => {},
    });
    svcHolder.svc = svc;
    svc.setUi(ui);
    const g1 = svc.bumpGenerationSeq();
    assert.equal(g1, 1);
    assert.equal(svc.isGenerationSuperseded(1), false);
    svc.bumpGenerationSeq();
    assert.equal(svc.isGenerationSuperseded(1), true);
  });

  it('polishUserTask returns cached result without calling LLM', async () => {
    const posted: unknown[] = [];
    const ui = mockUi(posted);
    let llmCalls = 0;
    const svcHolder = { svc: undefined as WorkflowGenerationService | undefined };
    const svc = new WorkflowGenerationService({
      ui,
      hostFactoryDeps: () => hostFactory(posted, svcHolder.svc!),
      invokeLlmRaw: async () => {
        llmCalls += 1;
        return 'polished text';
      },
      pickZoomOutFilePath: () => 'README.md',
      debugLog: () => {},
      degraded: () => {},
    });
    svcHolder.svc = svc;
    svc.setUi(ui);
    const panel = { webview: { postMessage: () => {} } } as never;
    svc.rememberPolishCache(svc.polishCacheKey('draft', 'software'), 'cached', '2020-01-01T00:00:00.000Z');
    await svc.polishUserTask('draft', 'software', panel);
    assert.equal(llmCalls, 0);
    const msg = posted.find((m) => typeof m === 'object' && m !== null && (m as { type?: string }).type === 'userTaskPolished');
    assert.ok(msg);
  });

  it('generateWorkflow posts workflowFailed when workspace path invalid', async () => {
    const posted: unknown[] = [];
    const ui = mockUi(posted);
    const svcHolder = { svc: undefined as WorkflowGenerationService | undefined };
    const svc = new WorkflowGenerationService({
      ui,
      hostFactoryDeps: () => hostFactory(posted, svcHolder.svc!),
      invokeLlmRaw: async () => '',
      pickZoomOutFilePath: () => 'README.md',
      debugLog: () => {},
      degraded: () => {},
    });
    svcHolder.svc = svc;
    svc.setUi(ui);
    const panel = { webview: { postMessage: () => {} } } as never;
    await svc.generateWorkflow('task', 'software', panel, '/no/such/path');
    const fail = posted.find((m) => typeof m === 'object' && (m as { type?: string }).type === 'workflowFailed');
    assert.ok(fail);
  });
});
