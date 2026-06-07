import type * as vscode from 'vscode';
import { LlmClient } from '../LlmClient';
import { WorkflowEngineDiagnostics } from '../WorkflowEngineDiagnostics';
import { WorkflowEngineHostRegistry } from '../WorkflowEngineHostRegistry';
import { WorkflowEngineInternals } from '../WorkflowEngineInternals';
import { WorkflowGenerationService } from '../WorkflowGenerationService';
import { WorkflowInstanceManager } from '../WorkflowInstanceManager';
import { WorkflowUiBridge } from '../WorkflowUiBridge';
import type { EngineHostFactoryDeps } from '../WorkflowEngineHostFactories';
import { buildMessagingHost } from '../WorkflowEngineHostFactories';
import type { MessagingHost } from '../WorkflowEngineMessaging';
import { createEngineFacades, type EngineFacades } from '../engine-facades/createEngineFacades';
import { WorkflowEngineLifecycle } from '../engine-facades/WorkflowEngineLifecycle';
import { readWorkspaceFolderPath } from '../adapters/vscodeWorkspacePaths';
import { expandUserHomePath, resolveExistingDirectoryPath } from '../WorkflowPathResolver';
import {
  FEEDBACK_LAST_ASKED_KEY,
  PREFERRED_LM_STATE_KEY,
} from '../instance/StagentGlobalStateKeys';
import { voidGlobalStateUpdate } from '../instance/GlobalStateSafeUpdate';
import { uiMsg } from '../l10n/uiStrings';
import { EngineRuntimeState } from './EngineRuntimeState';
import { LateBound } from './LateBound';

/** WorkflowEngine 装配产物：构造函数仅需逐字段赋值。 */
export interface WorkflowEngineParts {
  state: EngineRuntimeState;
  ui: WorkflowUiBridge;
  instanceManager: WorkflowInstanceManager;
  generationService: WorkflowGenerationService;
  lifecycle: WorkflowEngineLifecycle;
  llm: LlmClient;
  diagnostics: WorkflowEngineDiagnostics;
  hostRegistry: WorkflowEngineHostRegistry;
  internals: WorkflowEngineInternals;
  facades: EngineFacades;
}

/**
 * 集中完成 WorkflowEngine 的全部依赖装配（原 130 行构造函数）。
 *
 * 循环依赖处理：
 * - `internals` 经 LateBound 延迟绑定（其它服务对它的引用都在闭包内、调用期才解引用）；
 * - `ui` 先于 instance/generation 服务创建并直接传入，无需 null 占位 + setUi；
 * - `executeNextStage` 经可变 ref 盒在 facades 就绪后回填（见下方 comment block）。
 */
export function createWorkflowEngineParts(
  context: vscode.ExtensionContext,
): WorkflowEngineParts {
  const state = new EngineRuntimeState(
    context.globalState.get<string>(PREFERRED_LM_STATE_KEY) ?? '',
  );
  const internalsRef = new LateBound<WorkflowEngineInternals>('WorkflowEngineInternals');

  /*
   * ── Single cycle seam: executeNextStageRef ──
   *
   * The execution loop must call back into facades.execution.executeNextStage,
   * but facades cannot exist until internals, hostRegistry, and services are wired.
   * This mutable ref box is the only intentional cycle in the engine graph:
   *
   *   createWorkflowEngineParts
   *     → internals / hostRegistry / services
   *     → facades (closures capture executeNextStageRef)
   *     → executeNextStageRef.fn = facades.execution.executeNextStage
   *
   * Host-factory and messaging closures read through this ref; no other LateBound
   * or post-construction assignment is used for dependency wiring.
   */
  const executeNextStageRef: {
    fn: (panel?: vscode.WebviewPanel) => Promise<void>;
  } = { fn: async () => {} };

  let cachedHostFactoryDeps: EngineHostFactoryDeps | undefined;
  let cachedMessagingHost: MessagingHost | undefined;
  const resolveHostFactoryDeps = (): EngineHostFactoryDeps => {
    if (!cachedHostFactoryDeps) {
      cachedHostFactoryDeps = internalsRef
        .get()
        .hostFactoryDeps((panel) => executeNextStageRef.fn(panel));
    }
    return cachedHostFactoryDeps;
  };

  const ui = new WorkflowUiBridge({
    messagingHost: () => {
      if (!cachedMessagingHost) {
        cachedMessagingHost = buildMessagingHost(resolveHostFactoryDeps());
      }
      return cachedMessagingHost;
    },
    getFeedbackLastAsked: () => context.globalState.get<string>(FEEDBACK_LAST_ASKED_KEY),
    setFeedbackLastAsked: async (iso) => {
      await context.globalState.update(FEEDBACK_LAST_ASKED_KEY, iso);
    },
  });

  const instanceManager = new WorkflowInstanceManager({
    context,
    ui,
    warn: (message) => internalsRef.get().warn(message),
    degraded: (reason, context) => internalsRef.get().degraded(reason, context),
    onGlobalStateFailed: (instanceKey) => {
      diagnostics.warn(`global_state_sync_degraded key=${instanceKey}`);
      lifecycle.postMessage(ui.getActivePanel(), {
        type: 'actionHint',
        message: uiMsg('stagent.warn.globalStateSyncFailed'),
      });
      // 兜底：globalState 失败后磁盘为唯一权威，重写一次磁盘快照保证最新
      // persistRevision 落盘（加载时按 revision 取较新者）。guard 防止快照内再次
      // globalState 失败导致回调重入死循环——每次失败只兜底一次。
      if (!state.globalStateRewriteInFlight.has(instanceKey)) {
        state.globalStateRewriteInFlight.add(instanceKey);
        try {
          instanceManager.persistence.persistMilestone();
        } finally {
          state.globalStateRewriteInFlight.delete(instanceKey);
        }
      }
    },
    debugLog: (stageId, event, attempt, payload) =>
      internalsRef.get().debugLog(stageId, event, attempt, payload),
    getExecutionDepth: () => state.executionDepth,
    executeNextStage: (panel) => executeNextStageRef.fn(panel),
    expandUserHomePath: (raw) => expandUserHomePath(raw),
    resolveExistingDirectoryPath: (raw) => resolveExistingDirectoryPath(raw),
    workspaceFolderPath: () => readWorkspaceFolderPath(),
    hostFactoryDeps: () => resolveHostFactoryDeps(),
  });

  const generationService = new WorkflowGenerationService({
    ui,
    hostFactoryDeps: () => resolveHostFactoryDeps(),
    invokeLlmRaw: (sys, user, panel, trace) =>
      internalsRef.get().invokeLlmRaw(sys, user, panel, trace),
    pickZoomOutFilePath: (pref) => internalsRef.get().pickZoomOutFilePath(pref),
    debugLog: (stageId, event, attempt, payload) =>
      internalsRef.get().debugLog(stageId, event, attempt, payload),
    degraded: (reason, context) => internalsRef.get().degraded(reason, context),
  });

  const lifecycle = new WorkflowEngineLifecycle(ui, instanceManager);

  const diagnostics = new WorkflowEngineDiagnostics({
    getActiveInstanceKey: () => instanceManager.lifecycle.getActiveInstanceKey(),
    getTraceId: () => instanceManager.lifecycle.getInstance()?.traceId,
    ensureTaskDir: (key) => internalsRef.get().ensureTaskDir(key),
    getOrCreateOutputChannel: () => internalsRef.get().getOutputChannel(),
    getGlobalStoragePath: () => context.globalStorageUri.fsPath,
  });

  const llm = new LlmClient({
    getPreferredModelFamily: () => state.preferredModelFamily,
    postMessage: (panel, msg) => ui.postMessage(panel, msg),
    sessionLog: (stageId, event, payload) => diagnostics.sessionLog(stageId, event, payload),
    logUserAction: (kind, detail) => diagnostics.logUserAction(kind, detail),
    warn: (message) => diagnostics.warn(message),
    debugLog: (stageId, event, attempt, payload) =>
      diagnostics.debugLog(stageId, event, attempt, payload),
  });

  const hostRegistry = new WorkflowEngineHostRegistry(
    () => resolveHostFactoryDeps(),
    llm,
    () => instanceManager.persistence.scheduleSave(),
    (panel, msg) => lifecycle.postMessage(panel, msg),
    (stageId, event, attempt, payload) =>
      internalsRef.get().debugLog(stageId, event, attempt, payload),
    (kind, detail) => diagnostics.logUserAction(kind, detail),
    (message) => internalsRef.get().warn(message),
    (key, panel) => instanceManager.resume.ensureInstanceBound(key, panel),
  );

  const internals = new WorkflowEngineInternals({
    context,
    instances: instanceManager,
    generation: generationService,
    ui,
    llm,
    diagnostics,
    hostRegistry,
    getExecutionDepth: () => state.executionDepth,
    setExecutionDepth: (depth) => {
      state.executionDepth = depth;
    },
    getPreferredModelFamily: () => state.preferredModelFamily,
    getInstancesChangedListener: () => lifecycle.getInstancesChangedListener(),
    getOutputChannelRef: () => state.outputChannel,
    setOutputChannelRef: (channel) => {
      state.outputChannel = channel;
    },
  });
  internalsRef.set(internals);

  const facades = createEngineFacades({
    context,
    instanceManager,
    generationService,
    ui,
    diagnostics,
    llm,
    hostRegistry,
    getInternals: () => internalsRef.get(),
    getExecutionDepth: () => state.executionDepth,
    getPreferredModelFamily: () => state.preferredModelFamily,
    setPreferredModelFamily: (modelFamily) => {
      state.preferredModelFamily = modelFamily;
      llm.invalidateModelCache();
      voidGlobalStateUpdate(
        () => context.globalState.update(PREFERRED_LM_STATE_KEY, modelFamily),
        (m) => diagnostics.warn(m),
        PREFERRED_LM_STATE_KEY,
      );
    },
  });

  executeNextStageRef.fn = (panel) => facades.execution.executeNextStage(panel);

  return {
    state,
    ui,
    instanceManager,
    generationService,
    lifecycle,
    llm,
    diagnostics,
    hostRegistry,
    internals,
    facades,
  };
}
