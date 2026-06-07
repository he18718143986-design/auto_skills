import type { Stage, WorkflowDefinition } from '../WorkflowDefinition';
import {
  isDecideStageId,
  isImplStageId,
  isTestRunStageId,
  isTestWriteStageId,
  semanticNameFromTestRunStageId,
} from '../workflow/StageIdPatterns';
import { findLastImplStageIndex } from '../TddSliceScope';
import {
  buildFixIfFailedStage,
  buildNpmInstallServerStage,
  buildServerAppEntryStage,
  buildVerifyImportsStage,
  buildVerifyServerTscStage,
  inferServerTestFile,
  isBundleWriteStageId,
  isSelfHealStageId,
} from './SelfHealStageFactory';

export interface SelfHealInjectionResult {
  workflow: WorkflowDefinition;
  insertedStageIds: string[];
  movedStageIds: string[];
  violations: string[];
}

function stageIndex(stages: Stage[], id: string): number {
  return stages.findIndex((s) => s.id === id);
}

function hasStage(stages: Stage[], id: string): boolean {
  return stages.some((s) => s.id === id);
}

function lastImplBefore(stages: Stage[], beforeIdx: number): number {
  for (let i = beforeIdx - 1; i >= 0; i--) {
    const s = stages[i]!;
    if (isImplStageId(s.id) && !isBundleWriteStageId(s.id) && !isSelfHealStageId(s.id)) {
      return i;
    }
    if (isDecideStageId(s.id)) {
      break;
    }
  }
  return -1;
}

function isServerSliceTestRun(testRunId: string): boolean {
  const semantic = semanticNameFromTestRunStageId(testRunId) ?? '';
  return (
    semantic.includes('integration') ||
    semantic.includes('chat_integration') ||
    semantic.includes('voice')
  );
}

function matchingTestWriteId(testRunId: string): string | undefined {
  const runSemantic = semanticNameFromTestRunStageId(testRunId);
  if (!runSemantic) {
    return undefined;
  }
  return `stage_test_write_${runSemantic}`;
}

function insertAfter(stages: Stage[], afterId: string, toInsert: Stage[]): Stage[] {
  const idx = stageIndex(stages, afterId);
  if (idx < 0) {
    return [...stages, ...toInsert];
  }
  const next = [...stages];
  next.splice(idx + 1, 0, ...toInsert);
  return next;
}

function moveStageAfter(stages: Stage[], stageId: string, afterId: string): { stages: Stage[]; moved: boolean } {
  const from = stageIndex(stages, stageId);
  const after = stageIndex(stages, afterId);
  if (from < 0 || after < 0 || from === after + 1) {
    return { stages, moved: false };
  }
  const next = [...stages];
  const [item] = next.splice(from, 1);
  const adjustedAfter = from < after ? after - 1 : after;
  next.splice(adjustedAfter + 1, 0, item!);
  return { stages: next, moved: true };
}

/**
 * 为工作流注入自修复阶段：verify_tsc / verify_imports / fix_if_failed / npm_install，
 * 并纠正 test_write 排在 impl 之前的违规顺序。
 */
export function injectSelfHealStages(workflow: WorkflowDefinition): SelfHealInjectionResult {
  let stages = [...(workflow.stages ?? [])];
  const insertedStageIds: string[] = [];
  const movedStageIds: string[] = [];
  const violations: string[] = [];

  const firstTestRunIdx = stages.findIndex((s) => isTestRunStageId(s.id));
  if (firstTestRunIdx >= 0 && !hasStage(stages, 'stage_npm_install_server')) {
    const anchor =
      stages
        .slice(0, firstTestRunIdx)
        .map((s) => s.id)
        .filter((id) => isImplStageId(id) && !isBundleWriteStageId(id))
        .pop() ?? stages[firstTestRunIdx - 1]?.id;
    if (anchor) {
      stages = insertAfter(stages, anchor, [buildNpmInstallServerStage([anchor])]);
      insertedStageIds.push('stage_npm_install_server');
    }
  }

  if (!hasStage(stages, 'stage_impl_server_app')) {
    const entryBundle = 'stage_impl_server_entry_stagent_bundle_write';
    if (hasStage(stages, entryBundle)) {
      stages = insertAfter(stages, entryBundle, [buildServerAppEntryStage([entryBundle])]);
      insertedStageIds.push('stage_impl_server_app');
    }
  }

  if (!hasStage(stages, 'stage_verify_server_bootstrap_tsc')) {
    const anchor = hasStage(stages, 'stage_impl_server_app')
      ? 'stage_impl_server_app'
      : 'stage_impl_server_entry_stagent_bundle_write';
    if (hasStage(stages, anchor)) {
      stages = insertAfter(stages, anchor, [
        buildVerifyServerTscStage({
          id: 'stage_verify_server_bootstrap_tsc',
          title: '验证服务端可编译（bootstrap）',
          dependsOn: [anchor],
        }),
      ]);
      insertedStageIds.push('stage_verify_server_bootstrap_tsc');
    }
  }

  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i]!;
    if (!isTestRunStageId(stage.id)) {
      continue;
    }

    const testRunId = stage.id;
    const testWriteId = matchingTestWriteId(testRunId);
    const writeIdx = testWriteId ? stageIndex(stages, testWriteId) : -1;
    const runIdx = stageIndex(stages, testRunId);

    if (writeIdx >= 0 && writeIdx > runIdx) {
      violations.push(`${testWriteId} 排在 ${testRunId} 之后`);
    }

    if (writeIdx >= 0 && testWriteId) {
      const lastImplIdx = findLastImplStageIndex(stages, runIdx);
      if (lastImplIdx >= 0 && writeIdx < lastImplIdx) {
        const anchorImpl = stages[lastImplIdx]!;
        const bundleId = `${anchorImpl.id}_stagent_bundle_write`;
        const moveAfterId = hasStage(stages, bundleId) ? bundleId : anchorImpl.id;
        const moved = moveStageAfter(stages, testWriteId, moveAfterId);
        if (moved.moved) {
          stages = moved.stages;
          movedStageIds.push(testWriteId);
          violations.push(`${testWriteId} 原在 impl 之前，已移至 ${moveAfterId} 之后`);
        }
      }
    }

    const semantic = semanticNameFromTestRunStageId(testRunId) ?? 'slice';
    const verifyTscId = `stage_verify_${semantic}_tsc`;
    const verifyImportsId = `stage_verify_imports_${semantic}`;
    const fixId = `stage_fix_if_failed_${semantic}`;

    if (isServerSliceTestRun(testRunId) && !hasStage(stages, verifyTscId)) {
      const writeId = testWriteId && hasStage(stages, testWriteId) ? testWriteId : undefined;
      const anchor = writeId ?? (lastImplBefore(stages, runIdx) >= 0 ? stages[lastImplBefore(stages, runIdx)]!.id : undefined);
      if (anchor) {
        stages = insertAfter(stages, anchor, [
          buildVerifyServerTscStage({
            id: verifyTscId,
            title: `验证可编译（${semantic}）`,
            dependsOn: [anchor],
          }),
        ]);
        insertedStageIds.push(verifyTscId);
      }
    }

    const refreshedWriteIdx = testWriteId ? stageIndex(stages, testWriteId) : -1;
    const refreshedRunIdx = stageIndex(stages, testRunId);
    if (refreshedWriteIdx >= 0 && refreshedRunIdx >= 0) {
      const between = stages.slice(refreshedWriteIdx + 1, refreshedRunIdx);
      const hasVerifyBetween = between.some((s) => s.id.startsWith('stage_verify_imports_'));
      if (!hasVerifyBetween && !hasStage(stages, verifyImportsId)) {
        const testFile = inferServerTestFile(testRunId);
        if (testFile) {
          stages = insertAfter(stages, testWriteId!, [
            buildVerifyImportsStage({
              id: verifyImportsId,
              title: `验证测试 import 路径（${semantic}）`,
              testFiles: [testFile],
              dependsOn: [testWriteId!],
            }),
          ]);
          insertedStageIds.push(verifyImportsId);
          violations.push(`${testRunId} 前缺少 verify_imports，已插入 ${verifyImportsId}`);
        }
      } else if (refreshedRunIdx === refreshedWriteIdx + 1) {
        violations.push(`禁止模式：${testRunId} 紧跟 ${testWriteId}，无 verify_imports`);
      }
    }

    if (!hasStage(stages, fixId)) {
      const tscForFix = hasStage(stages, verifyTscId)
        ? verifyTscId
        : hasStage(stages, 'stage_verify_server_bootstrap_tsc')
          ? 'stage_verify_server_bootstrap_tsc'
          : verifyTscId;
      stages = insertAfter(stages, testRunId, [
        buildFixIfFailedStage({
          id: fixId,
          title: `修复失败测试（${semantic}）`,
          testRunStageId: testRunId,
          verifyTscStageId: tscForFix,
          dependsOn: [testRunId],
          writeTargets: ['server/src/app.ts', 'server/src/index.ts'],
        }),
      ]);
      insertedStageIds.push(fixId);
    }
  }

  return {
    workflow: { ...workflow, stages },
    insertedStageIds,
    movedStageIds,
    violations,
  };
}

/** 列出仍缺少自修复链路的 test_run 阶段（注入后审计）。 */
export function auditSelfHealGaps(workflow: WorkflowDefinition): string[] {
  const stages = workflow.stages ?? [];
  const gaps: string[] = [];
  for (let i = 0; i < stages.length; i++) {
    const s = stages[i]!;
    if (!isTestRunStageId(s.id)) {
      continue;
    }
    const writeId = matchingTestWriteId(s.id);
    const writeIdx = writeId ? stageIndex(stages, writeId) : -1;
    if (writeIdx >= 0 && i === writeIdx + 1) {
      gaps.push(`${s.id}: 紧跟 test_write，无 verify_imports`);
    }
    const semantic = semanticNameFromTestRunStageId(s.id) ?? 'x';
    if (!hasStage(stages, `stage_fix_if_failed_${semantic}`)) {
      gaps.push(`${s.id}: 缺少 stage_fix_if_failed_${semantic}`);
    }
  }
  const firstRun = stages.findIndex((s) => isTestRunStageId(s.id));
  if (firstRun >= 0 && !hasStage(stages, 'stage_npm_install_server')) {
    gaps.push('首个 test_run 前缺少 stage_npm_install_server');
  }
  return gaps;
}
