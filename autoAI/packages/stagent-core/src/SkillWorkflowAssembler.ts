/* ------------------------------------------------------------------ */
/*  SkillWorkflowAssembler — S1：把「场景路由 + skill 序列」编排为一个      */
/*  引擎可执行的 WorkflowDefinition（grill 为 native 决策阶段）。          */
/*                                                                     */
/*  这是 ScenarioRouter（选哪些 skill）与 SkillStageFactory（每个 skill   */
/*  → llm-text 阶段）之间的「编排粘合层」。产出的工作流满足               */
/*  validateGeneratedWorkflow（结构 + 不变式 I-1/I-5/...），即可被现有     */
/*  WorkflowEngine 正常 normalize / 执行。                               */
/*                                                                     */
/*  见 SKILLS-ENGINE-INTEGRATION.md §3–§5。                             */
/* ------------------------------------------------------------------ */

import type { Stage, WorkflowDefinition, WorkflowMeta } from './WorkflowDefinition';
import type { SkillRegistry, SkillSource } from './SkillRegistry';
import type { SkillContextBundle } from './SkillPromptAssembler';
import type { ScenarioInput, ScenarioRoute } from './ScenarioRouter';
import { routeScenario, SKILL_GRILL_ME, SKILL_GRILL_WITH_DOCS } from './ScenarioRouter';
import { buildGrillStage, buildSkillStage } from './SkillStageFactory';

const GRILL_REFS = new Set<string>([SKILL_GRILL_WITH_DOCS, SKILL_GRILL_ME]);

export interface AssembleSkillWorkflowOptions {
  /** 注入每个 skill 阶段的上下文包（Charter / CONTEXT / ADR / 用户任务等） */
  bundle?: SkillContextBundle;
  /** 工作流元信息（title / taskType / userInput / isGreenfield 等）；缺省自动补齐 */
  meta?: Partial<WorkflowMeta>;
  /** 工作流 id（缺省自动生成） */
  id?: string;
}

export interface AssembleSkillWorkflowResult {
  workflow: WorkflowDefinition;
  route: ScenarioRoute;
  /** 因 registry 未命中而被跳过的 skillRef（透明可审计） */
  skipped: string[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function buildMeta(input: ScenarioInput, route: ScenarioRoute, meta?: Partial<WorkflowMeta>): WorkflowMeta {
  return {
    title: meta?.title ?? `Skill 工作流（${route.template}）`,
    taskType: meta?.taskType ?? input.taskType,
    userInput: meta?.userInput ?? '',
    createdAt: meta?.createdAt ?? nowIso(),
    ...(input.repo.isGreenfield ? { isGreenfield: true } : {}),
    ...(meta?.taskWorkspacePath ? { taskWorkspacePath: meta.taskWorkspacePath } : {}),
  };
}

/**
 * 把一个 skillRef 编译为阶段。grill → native 决策阶段；其余 → 普通 llm-text skill 阶段。
 * registry 未命中返回 undefined（调用方记入 skipped）。
 */
export function buildStageForSkillRef(
  skillRef: string,
  registry: SkillRegistry,
  bundle: SkillContextBundle,
): Stage | undefined {
  const skill = registry.get(skillRef);
  if (!skill) {
    return undefined;
  }
  if (GRILL_REFS.has(skillRef)) {
    return buildGrillStage(skill, bundle);
  }
  return buildSkillStage(skill, bundle, { title: `Skill: ${skill.ref}` });
}

/**
 * 由「已路由的场景」编排 skill-native 工作流。
 * 线性顺序 = route.skillSequence；grill 为决策阶段（HITL）。
 */
export function assembleSkillWorkflow(
  input: ScenarioInput,
  registry: SkillRegistry,
  opts: AssembleSkillWorkflowOptions = {},
): AssembleSkillWorkflowResult {
  const route = routeScenario(input);
  const bundle: SkillContextBundle = opts.bundle ?? {};
  const stages: Stage[] = [];
  const skipped: string[] = [];

  for (const ref of route.skillSequence) {
    const stage = buildStageForSkillRef(ref, registry, bundle);
    if (stage) {
      stages.push(stage);
    } else {
      skipped.push(ref);
    }
  }

  const workflow: WorkflowDefinition = {
    id: opts.id ?? `skillwf_${Math.random().toString(36).slice(2, 10)}`,
    version: '2.0',
    meta: buildMeta(input, route, opts.meta),
    stages,
  };

  return { workflow, route, skipped };
}

/**
 * S4 混合模式：在引擎（LLM）生成的 impl/test 工作流**前面**插入一个 native grill 决策阶段。
 * 实现「skills 的判断（原版 grill 对齐 + HITL）+ 引擎的产出（impl/test/Rule20/自愈/写文件）」。
 *
 * - grill 阶段 id 为 `stage_skill_*`，不匹配 Rule20 的 `stage_decide_` 配对规则，
 *   也不会使整体变成 skill-native（impl 段仍受 Rule20 约束）→ 兼顾判断与可靠产出。
 * - 已存在同 id 阶段则原样返回（幂等）。
 */
export function prependGrillStage(
  wf: WorkflowDefinition,
  grillSkill: SkillSource,
  bundle: SkillContextBundle = {},
): WorkflowDefinition {
  const grill = buildGrillStage(grillSkill, bundle);
  if ((wf.stages ?? []).some((s) => s.id === grill.id)) {
    return wf;
  }
  return { ...wf, stages: [grill, ...(wf.stages ?? [])] };
}
