#!/usr/bin/env node
/**
 * Cross-layer import boundary scan (aligns with docs/architecture.md).
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'src');

const LAYERS = ['ui', 'core', 'exec', 'gates', 'store', 'model', 'settings', 'infra', 'webview', 'generated', 'test'];

function classify(rel) {
  const p = rel.replace(/\\/g, '/');
  if (p.startsWith('src/test/')) return 'test';
  if (p.startsWith('src/webview/')) return 'webview';
  if (p.startsWith('src/generated/')) return 'generated';
  if (p.startsWith('src/rule20/')) return 'gates';

  const base = path.basename(p, path.extname(p));

  if (
    p === 'src/extension.ts' ||
    p === 'src/StagentTaskListProvider.ts' ||
    p === 'src/StagentAiControlsProvider.ts' ||
    p === 'src/StagentOnboarding.ts' ||
    p.startsWith('src/Webview') ||
    p === 'src/WorkflowPanelMessageRouter.ts' ||
    p === 'src/WorkflowUiBridge.ts' ||
    p === 'src/InstanceSession.ts' ||
    p === 'src/DecisionReviewUi.ts' ||
    p === 'src/WebviewMessageGuards.ts' ||
    p === 'src/WebviewPauseUiState.ts' ||
    p === 'src/WorkflowArtifactUi.ts' ||
    p === 'src/WorkflowRecoveryViewModel.ts' ||
    p === 'src/ArtifactUiHints.ts' ||
    p === 'src/Rule20WarningDisplay.ts' ||
    p === 'src/TaskPolishPrompt.ts'
  ) {
    return 'ui';
  }

  if (
    p === 'src/WorkflowPersistence.ts' ||
    p === 'src/WorkflowInstanceRepository.ts' ||
    p === 'src/WorkflowInstancePersistenceSync.ts' ||
    p === 'src/WorkflowInstanceDiskIndex.ts' ||
    p === 'src/WorkflowDiskBootstrap.ts' ||
    p === 'src/WorkflowInstanceIndex.ts' ||
    p === 'src/ArtifactLifecycleManager.ts' ||
    p === 'src/AdrPersistence.ts' ||
    p === 'src/AdrStore.ts' ||
    p === 'src/ProjectGlossaryStore.ts' ||
    p === 'src/WorkflowExperienceStore.ts' ||
    p === 'src/PromptVersionManager.ts' ||
    p === 'src/WorkflowEnginePersistenceBridge.ts' ||
    p === 'src/WorkflowInstanceBind.ts'
  ) {
    return 'store';
  }

  if (
    p === 'src/WorkflowDefinition.ts' ||
    p === 'src/shared/WebviewMessages.ts' ||
    p === 'src/WorkflowDeletePlan.ts' ||
    p === 'src/WorkflowStateEnvelope.ts' ||
    p === 'src/WorkflowPathResolver.ts' ||
    p === 'src/WorkflowProcessDocs.ts' ||
    p === 'src/ArtifactTypes.ts' ||
    p === 'src/KeyNameMatching.ts' ||
    p === 'src/WorkflowOutputKeys.ts'
  ) {
    return 'model';
  }

  if (
    p.startsWith('src/settings/') ||
    p.startsWith('src/StagentSettings') ||
    p === 'src/EffectiveSettings.ts' ||
    p === 'src/uniappPackagePins.ts'
  ) {
    return 'settings';
  }

  if (
    p.startsWith('src/paths/') ||
    p.startsWith('src/jsonl/') ||
    p.startsWith('src/workspace/') ||
    p.startsWith('src/instance/') ||
    p === 'src/FsAsync.ts' ||
    p === 'src/JsonExtract.ts' ||
    p === 'src/OpenAiCompatibleLlm.ts' ||
    p === 'src/SseDeltaStream.ts' ||
    p === 'src/WriteOutputNormalize.ts' ||
    p === 'src/DebugLogUtils.ts' ||
    p === 'src/SessionDebugLog.ts' ||
    p === 'src/LogPreviewLimits.ts' ||
    p === 'src/TimeConstants.ts' ||
    p === 'src/UiListLimits.ts'
  ) {
    return 'infra';
  }

  if (
    p.includes('WorkflowExecutor') ||
    p.includes('WorkflowStage') ||
    p === 'src/WorkflowDag.ts' ||
    p === 'src/WorkflowDagGraph.ts' ||
    p === 'src/WorkflowCodeRunnerHost.ts' ||
    p === 'src/WorkflowNonLlmToolRunner.ts' ||
    p.startsWith('src/stage-runners/') ||
    p === 'src/ImplOutputExecution.ts' ||
    p === 'src/ImplOutputGuard.ts' ||
    p === 'src/TestRunPreflight.ts' ||
    p === 'src/TestRunCommandNormalize.ts' ||
    p === 'src/TestRunFailurePlaybook.ts' ||
    p === 'src/RedGreenFsm.ts' ||
    p === 'src/RedGreenGate.ts' ||
    p === 'src/WorkflowParallelMonitor.ts' ||
    p === 'src/CodeRunnerInvokeHelpers.ts' ||
    p === 'src/WorkflowInputResolver.ts' ||
    p === 'src/WorkflowInputContent.ts' ||
    p === 'src/StreamingSummary.ts'
  ) {
    return 'exec';
  }

  if (
    p.includes('QualityGate') ||
    p.includes('Gate.ts') ||
    p.includes('Lint.ts') ||
    p === 'src/Rule20Verify.ts' ||
    p === 'src/Rule20RuntimeGate.ts' ||
    p === 'src/ConfidenceScorer.ts' ||
    p === 'src/OutputQualityScorer.ts' ||
    p === 'src/DependencyGraphAnalyzer.ts' ||
    p === 'src/WorkflowComplexityEstimator.ts' ||
    p === 'src/StaticAnalysisPipeline.ts' ||
    p === 'src/PlanCompletenessGate.ts' ||
    p === 'src/WorkflowStructuralRepair.ts' ||
    p === 'src/WorkflowRule20Normalize.ts' ||
    p === 'src/GeneratedWorkflowGate.ts' ||
    p === 'src/DecisionRecordVerify.ts' ||
    p === 'src/DecisionContentLintPolicy.ts' ||
    p === 'src/ModuleDepthScorer.ts' ||
    p === 'src/PrototypeContractLint.ts' ||
    p === 'src/SampleHeaderContractLint.ts' ||
    p === 'src/CrossFileKeyContractLint.ts' ||
    p === 'src/SdkPathContractLint.ts' ||
    p === 'src/ConfigContractLint.ts' ||
    p === 'src/DebugFeedbackLoopGate.ts' ||
    p === 'src/ApproveDecisionGate.ts' ||
    p === 'src/HITLContractNodePolicy.ts' ||
    p === 'src/AdaptiveHITLPolicy.ts' ||
    p === 'src/FailurePatternAnalyzer.ts'
  ) {
    return 'gates';
  }

  if (
    p === 'src/WorkflowEngine.ts' ||
    p.includes('Coordinator') ||
    p.startsWith('src/engine-host/') ||
    p === 'src/WorkflowEngineHostFactories.ts' ||
    p.includes('WorkflowGeneration') ||
    p === 'src/WorkflowInstanceManager.ts' ||
    p === 'src/LlmClient.ts' ||
    p === 'src/LlmInvokeHelpers.ts' ||
    p.includes('WorkflowEngine') ||
    p === 'src/WorkflowInstanceQuery.ts' ||
    p === 'src/WorkflowArtifactRegistry.ts' ||
    p === 'src/GlobalDecisionContext.ts' ||
    p === 'src/ActiveInstanceGuard.ts' ||
    p === 'src/WorkflowValidation.ts' ||
    p === 'src/WorkflowPlanSummary.ts' ||
    p === 'src/WorkflowSkipCondition.ts' ||
    p === 'src/WorkflowStateTransitions.ts' ||
    p === 'src/WorkflowStagePosition.ts' ||
    p === 'src/QuestionBeforeFlow.ts' ||
    p === 'src/QuestionAfterFlow.ts' ||
    p === 'src/QuestionNormalization.ts' ||
    p === 'src/GrillAdaptiveFlow.ts' ||
    p === 'src/GrillCodeExplore.ts' ||
    p === 'src/GrillLoopPolicy.ts' ||
    p === 'src/TaskTypeResolution.ts' ||
    p === 'src/ReuseStrategy.ts' ||
    p === 'src/AgentSpecializationRouter.ts' ||
    p === 'src/CodebaseContextProvider.ts' ||
    p === 'src/ExperienceGeneratorContext.ts' ||
    p === 'src/ManualRetryLimit.ts' ||
    p === 'src/RetryOutputPolicy.ts' ||
    p === 'src/ErrorTypeUtils.ts' ||
    p === 'src/StageErrorCatalog.ts' ||
    p === 'src/SandboxExecutor.ts' ||
    p === 'src/PromptVersionManager.ts'
  ) {
    return 'core';
  }

  return 'core';
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|mjs)$/.test(e.name)) out.push(full);
  }
  return out;
}

const IMPORT_RE =
  /^\s*import\s+(?:type\s+)?(?:[\w*{}\s,]+\s+from\s+)?['"]([^'"]+)['"]|^\s*export\s+.*\s+from\s+['"]([^'"]+)['"]/gm;

function resolveImport(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const dir = path.dirname(fromFile);
  const exts = ['', '.ts', '.tsx', '.js'];
  for (const ext of exts) {
    const t = path.resolve(dir, spec + ext);
    if (fs.existsSync(t) && fs.statSync(t).isFile()) return t;
  }
  const idxTs = path.resolve(dir, spec, 'index.ts');
  if (fs.existsSync(idxTs)) return idxTs;
  return null;
}

function lineOfImport(content, spec) {
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(`'${spec}'`) || lines[i].includes(`"${spec}"`)) return i + 1;
  }
  return 1;
}

const files = walk(SRC);
const violations = [];
const multiLayer = [];

const COUNT_LAYERS = ['ui', 'core', 'exec', 'gates', 'store'];

for (const file of files) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const fromLayer = classify(rel);
  if (fromLayer === 'test' || fromLayer === 'webview' || fromLayer === 'generated') continue;

  const content = fs.readFileSync(file, 'utf8');
  const importedLayers = new Set();
  const importDetails = [];

  let m;
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(content))) {
    const spec = m[1] || m[2];
    if (!spec?.startsWith('.')) continue;
    const resolved = resolveImport(file, spec);
    if (!resolved) continue;
    const targetRel = path.relative(ROOT, resolved).replace(/\\/g, '/');
    const toLayer = classify(targetRel);
    if (toLayer === 'test' || toLayer === 'generated') continue;

    importDetails.push({ spec, targetRel, toLayer, line: lineOfImport(content, spec) });
    if (COUNT_LAYERS.includes(toLayer)) importedLayers.add(toLayer);
    if (['model', 'infra', 'settings'].includes(toLayer)) continue;

    if (fromLayer === 'ui' && (toLayer === 'exec' || toLayer === 'store')) {
      violations.push({
        kind: 'ui-cross',
        file: rel,
        line: lineOfImport(content, spec),
        fromLayer,
        toLayer,
        target: targetRel,
        spec,
      });
    }

    if (fromLayer === 'webview') {
      /* webview only talks via postMessage — host ui checked separately */
    }

    if (fromLayer === 'store' && (toLayer === 'core' || toLayer === 'exec' || toLayer === 'gates')) {
      violations.push({
        kind: 'store-reverse',
        file: rel,
        line: lineOfImport(content, spec),
        fromLayer,
        toLayer,
        target: targetRel,
        spec,
      });
    }
  }

  const substantive = [...importedLayers];
  if (substantive.length >= 3) {
    multiLayer.push({
      file: rel,
      fromLayer,
      layers: substantive.sort(),
      imports: importDetails.filter((d) => COUNT_LAYERS.includes(d.toLayer)),
    });
  }
}

console.log(JSON.stringify({ violations, multiLayer }, null, 2));
