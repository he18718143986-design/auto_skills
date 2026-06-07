/**
 * pre-stage 阶段内置 QualityGate（从 BuiltinQualityGates.ts 抽出，1.3）。
 */
import type { QualityGate } from '../QualityGate';
import { isDebugTaskType } from '../workflow/TaskType';
import { isLlmTextTool } from '../workflow/StageToolKinds';
import { evaluateDebugFeedbackLoopGate } from '../DebugFeedbackLoopGate';
import { applyRedGreenFsmResult, evaluateImplRedConfirmResult, planImplRedFsm } from '../RedGreenFsm';
import { lintTestRunPreflightOnDisk } from '../TestRunPreflight';
import {
  buildAutoNpmInstallConfig,
  resolveTestRunEffectiveCwd,
  shouldAutoNpmInstallBeforeTestRun,
} from '../TestRunAutoDepsInstall';
import {
  GATE_ID_DEBUG_FEEDBACK_LOOP,
  GATE_ID_RED_GREEN_PRE_IMPL,
  GATE_ID_SDK_PATH_CONTRACT_HARD,
  GATE_ID_TEST_RUN_CONTRACT_LINT,
  GATE_ID_TEST_RUN_DEPS_INSTALL,
  GATE_ID_TEST_RUN_PREFLIGHT,
} from '../QualityGateIds';
import { block, isImplStage, isTestRunStage, warn } from './gateHelpers';

export const BUILTIN_PRE_STAGE_GATES: QualityGate[] = [
  {
    id: GATE_ID_DEBUG_FEEDBACK_LOOP,
    label: 'Debug 反馈回路优先（I-26）',
    phase: 'pre-stage',
    priority: 10,
    when: 'always',
    enabled: (ctx) => !!ctx.stage && !!ctx.instance && isDebugTaskType(ctx.instance.definition.meta.taskType),
    evaluate(ctx) {
      const evaluation = evaluateDebugFeedbackLoopGate({
        workflow: ctx.instance!.definition,
        stage: ctx.stage!,
        stageIndex: ctx.stageIndex ?? 0,
        stageRuntimes: ctx.instance!.stageRuntimes,
        requireHard: ctx.executionHost?.readDebugFeedbackLoopRuntimeHard() ?? false,
      });
      if (!evaluation || evaluation.outcome === 'pass') {
        return null;
      }
      const severity = evaluation.outcome === 'block' ? 'block' : 'warn';
      return { gateId: GATE_ID_DEBUG_FEEDBACK_LOOP, severity, messages: [evaluation.reason] };
    },
  },
  {
    id: GATE_ID_RED_GREEN_PRE_IMPL,
    label: '红绿门（I-25）配对测试 RED 确认',
    phase: 'pre-stage',
    priority: 20,
    when: 'before-impl',
    enabled: (ctx) => isImplStage(ctx.stage) && !!ctx.stage && isLlmTextTool(ctx.stage.tool),
    async evaluate(ctx) {
      const host = ctx.executionHost;
      const stage = ctx.stage!;
      const instance = ctx.instance!;
      const runtime = ctx.stageRuntime;
      if (!host || !runtime) {
        return null;
      }
      const mode = host.readRedGreenGateMode();
      const plan = planImplRedFsm(stage, instance.definition, mode, runtime);
      if (plan.skipRunAlreadyConfirmed) {
        return null;
      }
      if (plan.phase !== 'run-paired-test' || !plan.pairedStage) {
        return null;
      }
      const pairedCfg = plan.pairedStage.toolConfig;
      if (pairedCfg.type !== 'code-runner') {
        return null;
      }
      const instanceKey = ctx.instanceKey ?? instance.definition.id;
      let evaluation;
      try {
        const res = await host.runCodeRunner(pairedCfg, instanceKey, plan.pairedStage.id);
        evaluation = evaluateImplRedConfirmResult({ mode, exitCode: res.exitCode, threw: false });
      } catch {
        evaluation = evaluateImplRedConfirmResult({ mode, exitCode: 1, threw: true });
      }
      applyRedGreenFsmResult(runtime, stage.id, evaluation);
      if (evaluation.outcome === 'pass') {
        return null;
      }
      return {
        gateId: GATE_ID_RED_GREEN_PRE_IMPL,
        severity: evaluation.outcome === 'block' ? 'block' : 'warn',
        messages: [evaluation.reason],
      };
    },
  },
  {
    id: GATE_ID_TEST_RUN_DEPS_INSTALL,
    label: 'test_run 前自动 npm install',
    phase: 'pre-stage',
    priority: 25,
    when: 'before-test-run',
    enabled: (ctx) =>
      isTestRunStage(ctx.stage) &&
      (ctx.executionHost?.readTestRunAutoNpmInstallEnabled() ?? false),
    async evaluate(ctx) {
      const host = ctx.executionHost;
      const stage = ctx.stage!;
      const instance = ctx.instance;
      const instanceKey = ctx.instanceKey;
      const stageIndex = ctx.stageIndex ?? 0;
      if (!host || !instanceKey || !instance) {
        return null;
      }
      const wr = host.getWorkspaceRootAbsolute();
      if (!wr) {
        return null;
      }
      const cfg = stage.toolConfig;
      if (cfg.type !== 'code-runner') {
        return null;
      }
      const baseCwd = host.resolveCodeRunnerCwd(cfg, instanceKey);
      const effectiveCwd = resolveTestRunEffectiveCwd({ workspaceRoot: wr, baseCwd, stage });
      if (
        !shouldAutoNpmInstallBeforeTestRun({
          stage,
          instance,
          stageIndex,
          effectiveCwd,
        })
      ) {
        return null;
      }
      const installCfg = buildAutoNpmInstallConfig(wr, effectiveCwd);
      let res;
      try {
        res = await host.runCodeRunner(installCfg, instanceKey, `${stage.id}:auto-deps`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return block(GATE_ID_TEST_RUN_DEPS_INSTALL, [
          `test_run 前自动 npm install 失败（cwd=${effectiveCwd}）：${msg}`,
        ]);
      }
      if (res.exitCode !== 0) {
        return block(GATE_ID_TEST_RUN_DEPS_INSTALL, [
          `test_run 前自动 npm install 失败（cwd=${effectiveCwd}，exitCode=${res.exitCode}）`,
        ]);
      }
      return null;
    },
  },
  {
    id: GATE_ID_TEST_RUN_PREFLIGHT,
    label: 'test_run 磁盘 preflight（M38/M39）',
    phase: 'pre-stage',
    priority: 30,
    when: 'before-test-run',
    // preflight 检测 node_modules/配置是否就绪，必须在自动 npm install 之后跑，
    // 否则会因依赖尚未安装而误报。显式声明依赖，防止重排 priority 时静默破坏顺序。
    dependsOn: [GATE_ID_TEST_RUN_DEPS_INSTALL],
    enabled: (ctx) =>
      isTestRunStage(ctx.stage) &&
      (ctx.executionHost?.readTestRunPreflightEnabled() ?? false),
    async evaluate(ctx) {
      const host = ctx.executionHost;
      const stage = ctx.stage!;
      const instanceKey = ctx.instanceKey;
      if (!host || !instanceKey) {
        return null;
      }
      const wr = host.getWorkspaceRootAbsolute();
      if (!wr) {
        return null;
      }
      const cfg = stage.toolConfig;
      if (cfg.type !== 'code-runner') {
        return null;
      }
      const cwd = host.resolveCodeRunnerCwd(cfg, instanceKey);
      const issue = await lintTestRunPreflightOnDisk({
        workspaceRoot: wr,
        cwd,
        stage,
        workflow: ctx.instance?.definition,
      });
      if (!issue) {
        return null;
      }
      return block(GATE_ID_TEST_RUN_PREFLIGHT, [issue.message], { issue });
    },
  },
  {
    id: GATE_ID_SDK_PATH_CONTRACT_HARD,
    label: 'SDK/路径契约 hard 门',
    phase: 'pre-stage',
    priority: 40,
    when: 'before-test-run',
    dependsOn: [GATE_ID_TEST_RUN_PREFLIGHT],
    enabled: (ctx) =>
      isTestRunStage(ctx.stage) &&
      (ctx.executionHost?.readSdkPathContractLintMode() ?? 'off') === 'hard',
    async evaluate(ctx) {
      const host = ctx.executionHost;
      if (!host) {
        return null;
      }
      const issue = await host.runSdkPathContractHardGate();
      if (!issue) {
        return null;
      }
      return block(
        GATE_ID_SDK_PATH_CONTRACT_HARD,
        [`sdk-path-contract（M39.2 · ${issue.code}）：${issue.message}`],
        { issue },
      );
    },
  },
  {
    id: GATE_ID_TEST_RUN_CONTRACT_LINT,
    label: 'test_run 前跨文件契约 lint（warning）',
    phase: 'pre-stage',
    priority: 50,
    when: 'before-test-run',
    enabled: (ctx) => isTestRunStage(ctx.stage),
    async evaluate(ctx) {
      const host = ctx.executionHost;
      if (!host) {
        return null;
      }
      const messages = await host.runWorkspaceContractLint();
      return messages.length ? warn(GATE_ID_TEST_RUN_CONTRACT_LINT, messages) : null;
    },
  },
];
