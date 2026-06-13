import { semanticNameFromTddStageId } from '../../workflow/StageIdPatterns';

const RE_FIX_SEMANTIC = /^stage_fix_if_failed_(.+)$/;
import type { ExecStageStatus } from './stageStatusPolicy';
import type { StageExecSemantic } from '../../workflow-types/MessageTypes';

export interface SliceHealthRow {
  semanticKey: string;
  implStatus: ExecStageStatus | 'n/a';
  testRunStatus: ExecStageStatus | 'n/a';
  fixStatus: ExecStageStatus | 'n/a';
  testRunSemantic?: StageExecSemantic;
}

export function buildSliceHealthRows(
  stages: Array<{ id: string; isDecisionStage?: boolean }>,
  stageStatus: Record<string, ExecStageStatus>,
  stageExecSemantic: Record<string, StageExecSemantic>,
): SliceHealthRow[] {
  const bySemantic = new Map<string, SliceHealthRow>();

  for (const st of stages) {
    const semantic = semanticNameFromTddStageId(st.id) ?? RE_FIX_SEMANTIC.exec(st.id)?.[1];
    if (!semantic) {
      continue;
    }
    let row = bySemantic.get(semantic);
    if (!row) {
      row = {
        semanticKey: semantic,
        implStatus: 'n/a',
        testRunStatus: 'n/a',
        fixStatus: 'n/a',
      };
      bySemantic.set(semantic, row);
    }
    if (st.id.startsWith('stage_impl_')) {
      row.implStatus = stageStatus[st.id] ?? 'pending';
    } else if (st.id.startsWith('stage_test_run_')) {
      row.testRunStatus = stageStatus[st.id] ?? 'pending';
      row.testRunSemantic = stageExecSemantic[st.id];
    } else if (st.id.startsWith('stage_fix_if_failed_')) {
      row.fixStatus = stageStatus[st.id] ?? 'pending';
    }
  }

  return [...bySemantic.values()];
}
