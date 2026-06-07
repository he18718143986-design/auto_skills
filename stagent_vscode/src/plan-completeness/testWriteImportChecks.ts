import { collectWorkflowArtifacts } from '../WorkflowArtifactRegistry';
import { importPathCoveredByArtifacts } from '../artifact-registry/importPathCoverage';
import { extractRelativeImportSpecs } from '../ImportExtract';
import { planCompletenessMsg } from '../l10n/lintMsg';
import { isTestWriteStageId } from '../workflow/StageIdPatterns';
import { isLlmTextTool } from '../workflow/StageToolKinds';
import { writeOutputToFileOf } from './planCompletenessStageAccess';
import type { Stage, WorkflowDefinition } from '../WorkflowDefinition';
import type { PlanCompletenessIssue } from './planCompletenessTypes';

const QUOTED_RELATIVE_PATH = /['"`]((\.\.?\/)[^'"`\s]+)['"`]/g;
const BACKTICK_RELATIVE_PATH = /`((\.\.?\/)[^`]+)`/g;

function textOfStage(stage: Stage): string {
  const prompt = (stage.toolConfig as { systemPrompt?: string }).systemPrompt ?? '';
  const desc = stage.description ?? '';
  return `${prompt}\n${desc}`;
}

/** 从 test_write prompt 提取相对路径引用（import 语句、引号内路径、反引号路径）。 */
export function extractRelativePathRefsFromPrompt(text: string): string[] {
  const specs = new Set<string>(extractRelativeImportSpecs(text));
  for (const re of [QUOTED_RELATIVE_PATH, BACKTICK_RELATIVE_PATH]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const spec = m[1]?.trim();
      if (spec?.startsWith('.')) {
        specs.add(spec);
      }
    }
  }
  return [...specs];
}

function isServerIntegrationTestWrite(stage: Stage): boolean {
  const out = writeOutputToFileOf(stage)?.replace(/\\/g, '/').toLowerCase() ?? '';
  if (!out.includes('server/__tests__/') && !out.includes('server/tests/')) {
    return false;
  }
  const text = textOfStage(stage);
  return /integration|integrat|jest|socket\.?io|supertest|集成测试|端到端/i.test(text);
}

function hasRelativeImportDeclaration(text: string): boolean {
  if (extractRelativePathRefsFromPrompt(text).length > 0) {
    return true;
  }
  return /from\s+['"]\.\.?\/|import\s+['"]\.\.?\/|被测模块|import\s+路径|相对\s*import/i.test(text);
}

/**
 * M39.3（生成期）：stage_test_write_* 的 systemPrompt 中引用的相对 import 路径
 * 须对应工作流 writeOutputToFile artifact registry 中的落盘路径（M39.2 前移到 workflow-gen）。
 */
export function lintTestWriteImportPathsInPlan(wf: WorkflowDefinition): PlanCompletenessIssue[] {
  const registry = collectWorkflowArtifacts(wf);
  const issues: PlanCompletenessIssue[] = [];
  const seen = new Set<string>();

  for (const stage of wf.stages ?? []) {
    if (!isTestWriteStageId(stage.id) || !isLlmTextTool(stage.tool)) {
      continue;
    }
    const text = textOfStage(stage);
    const testOut = writeOutputToFileOf(stage) ?? stage.id;

    for (const imp of extractRelativePathRefsFromPrompt(text)) {
      if (importPathCoveredByArtifacts(imp, registry)) {
        continue;
      }
      const key = `${stage.id}:${imp}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      issues.push({
        type: 'test-write-import-not-in-plan',
        message: planCompletenessMsg('test-write-import-not-in-plan', testOut, imp, stage.id),
      });
    }

    if (isServerIntegrationTestWrite(stage) && !hasRelativeImportDeclaration(text)) {
      const key = `undeclared:${stage.id}`;
      if (!seen.has(key)) {
        seen.add(key);
        issues.push({
          type: 'test-write-import-undeclared',
          message: planCompletenessMsg('test-write-import-undeclared', testOut, stage.id),
        });
      }
    }
  }

  return issues;
}
