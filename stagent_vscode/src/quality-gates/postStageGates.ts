/**
 * post-stage 与 workflow-end 阶段内置 QualityGate（从 BuiltinQualityGates.ts 抽出，1.3）。
 */
import type { QualityGate } from '../QualityGate';
import { lintCharterConstraintHits } from '../charter/CharterConstraintsBlock';
import { loadCharterFromWorkspaceSync } from '../charter/CharterLoader';
import {
  readCharterEnabled,
  readCharterRelativePath,
} from '../settings/readers/charter';
import { getStagentConfiguration } from '../settings/getStagentConfiguration';
import {
  GATE_ID_CHARTER_CONSTRAINT_WARN,
  GATE_ID_POST_IMPL_STATIC_ANALYSIS,
  GATE_ID_RUN_END_CONTRACT_LINT,
} from '../QualityGateIds';
import { isImplStage, warn } from './gateHelpers';

export const BUILTIN_POST_STAGE_GATES: QualityGate[] = [
  {
    id: GATE_ID_CHARTER_CONSTRAINT_WARN,
    label: 'Charter avoid/constraint 边界告警（B-R2）',
    phase: 'post-stage',
    priority: 45,
    enabled: (ctx) => isImplStage(ctx.stage) && readCharterEnabled(getStagentConfiguration()),
    evaluate(ctx) {
      const ws = ctx.taskWorkspaceAbs ?? ctx.executionHost?.getWorkspaceRootAbsolute();
      const cfg = getStagentConfiguration();
      const doc = ws
        ? loadCharterFromWorkspaceSync(ws, readCharterRelativePath(cfg))
        : null;
      if (!doc) {
        return null;
      }
      const outputs = ctx.stageRuntime?.outputs ?? {};
      const text = Object.values(outputs)
        .map((v) => (typeof v === 'string' ? v : JSON.stringify(v)))
        .join('\n');
      const lint = lintCharterConstraintHits(doc, text);
      return lint.hit
        ? warn(GATE_ID_CHARTER_CONSTRAINT_WARN, lint.messages, { ruleRefs: lint.ruleRefs })
        : null;
    },
  },
  {
    id: GATE_ID_POST_IMPL_STATIC_ANALYSIS,
    label: 'impl 完成后静态分析',
    phase: 'post-stage',
    priority: 100,
    tags: ['static-analysis'],
    enabled: (ctx) =>
      isImplStage(ctx.stage) && (ctx.executionHost?.readStaticAnalysisEnabled() ?? false),
    async evaluate(ctx) {
      const host = ctx.executionHost;
      if (!host) {
        return null;
      }
      const messages = await host.runPostImplStaticAnalysis();
      return messages.length ? warn(GATE_ID_POST_IMPL_STATIC_ANALYSIS, messages) : null;
    },
  },
];

export const BUILTIN_WORKFLOW_END_GATES: QualityGate[] = [
  {
    id: GATE_ID_RUN_END_CONTRACT_LINT,
    label: 'run_end 兜底跨文件契约 lint',
    phase: 'workflow-end',
    priority: 1000,
    async evaluate(ctx) {
      const host = ctx.executionHost;
      if (!host) {
        return null;
      }
      const messages = await host.runWorkspaceContractLint();
      return messages.length ? warn(GATE_ID_RUN_END_CONTRACT_LINT, messages) : null;
    },
  },
];
