import type { Stage, WorkflowDefinition } from './WorkflowDefinition';
import { isSkillNativeWorkflow } from './SkillToolKinds';

/**
 * M27.1（新 P0）：计划完整性硬门。
 *
 * 背景：一次 prototype 端到端 `run_end {completed}`，但计划里**没有任何 test_run / code-runner**、
 * 也**没有 main/入口装配**——脚本从未被拼装、运行、验证，却报「完成」（空心成功的极端形态）。
 * 更糟的是 M21.1b / M22 / M26 的运行期 lint 都挂在 test_run 之后 → 没有 test_run 时整条链空转。
 *
 * 本门对「多文件 prototype/software 构建」要求两件事，缺失即阻断生成（走 M20.6 只读确认页 + 禁止开始执行）：
 * 1) 至少一个可执行验证阶段（code-runner / stage_test_run_*）；
 * 2) 至少一个 main/入口装配（把模块拼起来运行的入口）。
 *
 * 纯函数，便于单测。回滚开关：`stagent.plan.requireCompleteness`（默认 true）。
 */

export type PlanCompletenessViolationType = 'missing-verification-stage' | 'missing-main-assembly';

export interface PlanCompletenessIssue {
  type: PlanCompletenessViolationType;
  message: string;
}

const CODE_FILE_EXT = /\.(py|ts|tsx|js|jsx|mjs|cjs|go|rb|java|rs|kt|php|cs)$/i;

/** main/入口装配语义：把各模块拼起来执行的入口脚本/阶段 */
const MAIN_ASSEMBLY_HINT =
  /(^|_)(main|app|entry|cli|index|run|__main__|monitor|orchestrat|pipeline|server|bootstrap_run)(_|$)/i;

function semanticOf(stageId: string): string {
  return stageId.replace(/^stage_impl_(prototype_)?/, '');
}

/** 落盘为代码文件的实现阶段（用于判断是否为「多文件构建」） */
export function codeImplStages(wf: WorkflowDefinition): Stage[] {
  return (wf.stages ?? []).filter((s) => {
    if (!/^stage_impl_/.test(s.id)) {
      return false;
    }
    const file = String((s.toolConfig as { writeOutputToFile?: string })?.writeOutputToFile ?? '').trim();
    return !!file && CODE_FILE_EXT.test(file);
  });
}

/** 是否存在可执行验证阶段（code-runner 或 stage_test_run_*） */
export function hasExecutableVerificationStage(wf: WorkflowDefinition): boolean {
  return (wf.stages ?? []).some((s) => s.tool === 'code-runner' || /^stage_test_run_/.test(s.id));
}

/** 是否存在 main/入口装配阶段（main 类 impl，或运行 main/入口脚本的 code-runner） */
export function hasMainAssemblyStage(wf: WorkflowDefinition): boolean {
  return (wf.stages ?? []).some((s) => {
    if (/^stage_impl_/.test(s.id) && MAIN_ASSEMBLY_HINT.test(semanticOf(s.id))) {
      return true;
    }
    if (s.tool === 'code-runner') {
      const cmd = String((s.toolConfig as { command?: string })?.command ?? '');
      if (MAIN_ASSEMBLY_HINT.test(cmd) || /\b(main|app|run|cli|index|monitor)\.(py|ts|js)\b/i.test(cmd)) {
        return true;
      }
    }
    return false;
  });
}

/**
 * 仅对「多文件 prototype/software 构建」生效（≥2 个代码实现阶段），单文件 spike 豁免以免误拦。
 * - missing-verification-stage：≥2 代码实现但无任何可执行验证阶段。
 * - missing-main-assembly：≥3 代码实现（真·多模块管道）但无 main/入口装配。
 */
export function lintPlanCompleteness(wf: WorkflowDefinition): PlanCompletenessIssue[] {
  // S3：skill-native（纯规划/对齐）工作流无 impl/main/test，不适用计划完整性硬门。
  if (isSkillNativeWorkflow(wf)) {
    return [];
  }
  const taskType = wf.meta?.taskType;
  if (taskType !== 'prototype' && taskType !== 'software') {
    return [];
  }
  const codeImpls = codeImplStages(wf);
  if (codeImpls.length < 2) {
    return [];
  }
  const issues: PlanCompletenessIssue[] = [];
  if (!hasExecutableVerificationStage(wf)) {
    issues.push({
      type: 'missing-verification-stage',
      message:
        '计划缺少可执行验证阶段（code-runner / stage_test_run_*）：多文件构建若无验证阶段，会出现「跑通即完成」但从未真正运行的空心成功。请补充至少一个运行并断言结果的验证阶段。',
    });
  }
  if (codeImpls.length >= 3 && !hasMainAssemblyStage(wf)) {
    issues.push({
      type: 'missing-main-assembly',
      message:
        '计划缺少 main/入口装配阶段：检测到 ≥3 个代码模块但无入口把它们拼装运行（如 main.py / 运行入口的 code-runner），模块永远不会被集成。请补充入口装配 + 集成运行阶段。',
    });
  }
  return issues;
}

/** 阻断 generateWorkflow 时的 reason 文案（与 M20.6 blocked-confirm 复用）。 */
export function formatPlanCompletenessBlockReason(issues: PlanCompletenessIssue[]): string {
  if (issues.length === 0) {
    return 'plan-completeness: ok';
  }
  const body = issues.map((i) => `[${i.type}] ${i.message}`).join('；');
  return `plan_incomplete: ${body}`;
}
