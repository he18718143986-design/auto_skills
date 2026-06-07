import type { ToolPathBase, WorkflowDefinition } from './WorkflowDefinition';
import { applySoftwareDiskPipeline } from './WorkflowDiskBootstrap';
import { validateGeneratedWorkflow } from './WorkflowValidation';

export interface GeneratedWorkflowPreparationResult {
  workflow: WorkflowDefinition;
  errors: string[];
}

/**
 * A 方案：生成被硬门禁（validateGeneratedWorkflow / Rule20）拦截时，只要工作流结构本身可渲染，
 * 就仍把它推给确认页（只读、禁开始执行、顶部红色拦截原因），让用户照样能 30 秒看清
 * 「会写哪些文件 / 阶段怎么排 / 哪里要人工审」，而不是退回输入页只看到润色全文。
 * 此处仅判定「能否安全渲染卡片/时间线/落盘清单」，不重复结构合法性校验。
 */
export function isRenderableWorkflowForConfirm(wf: WorkflowDefinition | undefined | null): boolean {
  if (!wf || !Array.isArray(wf.stages) || wf.stages.length === 0) {
    return false;
  }
  return wf.stages.every(
    (s) =>
      !!s &&
      typeof s.id === 'string' &&
      s.id.trim().length > 0 &&
      typeof s.title === 'string' &&
      typeof s.tool === 'string' &&
      s.tool.trim().length > 0,
  );
}

/**
 * M20 兜底：模型常把 `writeOutputToFile` / `writePathBase` 误放在阶段顶层（与 `toolConfig` 平级）。
 * artifact 注册表与执行器仅读 `toolConfig.writeOutputToFile`，若不归一化会导致：注册表收集为空、执行期不
 * 落盘、code-runner 报 `python-script-not-in-artifacts`。此处就地把顶层字段提升进 `toolConfig`（已存在则不覆盖）。
 */
export function hoistStageWriteOutputToToolConfig(wf: WorkflowDefinition): WorkflowDefinition {
  for (const stage of wf.stages ?? []) {
    if (stage.tool !== 'llm-text') {
      continue;
    }
    const top = stage as unknown as { writeOutputToFile?: unknown; writePathBase?: unknown };
    const tc = stage.toolConfig as {
      type: 'llm-text';
      writeOutputToFile?: string;
      writePathBase?: ToolPathBase;
    };
    if (typeof top.writeOutputToFile === 'string' && top.writeOutputToFile.trim()) {
      if (!tc.writeOutputToFile?.trim()) {
        tc.writeOutputToFile = top.writeOutputToFile.trim();
      }
      delete top.writeOutputToFile;
    }
    if (typeof top.writePathBase === 'string' && top.writePathBase.trim()) {
      if (!tc.writePathBase) {
        tc.writePathBase = top.writePathBase as ToolPathBase;
      }
      delete top.writePathBase;
    }
  }
  return wf;
}

export function validateAndPrepareGeneratedWorkflow(
  wf: WorkflowDefinition,
  taskType: string,
): GeneratedWorkflowPreparationResult {
  const errors = validateGeneratedWorkflow(wf);
  if (errors.length > 0) {
    return { workflow: wf, errors };
  }

  if ((wf.meta?.taskType ?? taskType) === 'software') {
    return { workflow: applySoftwareDiskPipeline(wf), errors: [] };
  }

  return { workflow: wf, errors: [] };
}
