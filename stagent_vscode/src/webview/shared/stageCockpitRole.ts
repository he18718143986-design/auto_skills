import { wMsg } from '../l10n/wMsg';

export type CockpitStageRole =
  | 'worker'
  | 'verify'
  | 'repairer'
  | 'engine'
  | 'engine-replan'
  | 'decision'
  | 'other';

const RE_IMPL = /^stage_impl_/;
const RE_TEST_WRITE = /^stage_test_write_/;
const RE_TEST_RUN = /^stage_test_run_/;
const RE_FIX = /^stage_fix_if_failed_/;
const RE_REPLAN = /^stage_runtime_replan_/;
const RE_ENGINE = /^stage_(venv|pip|smoke|init_)/;

export function cockpitRoleFromStage(stageId: string, isDecisionStage?: boolean): CockpitStageRole {
  if (isDecisionStage) {
    return 'decision';
  }
  if (RE_REPLAN.test(stageId)) {
    return 'engine-replan';
  }
  if (RE_ENGINE.test(stageId)) {
    return 'engine';
  }
  if (RE_FIX.test(stageId)) {
    return 'repairer';
  }
  if (RE_TEST_RUN.test(stageId) || RE_TEST_WRITE.test(stageId)) {
    return 'verify';
  }
  if (RE_IMPL.test(stageId)) {
    return 'worker';
  }
  return 'other';
}

export function cockpitRoleLabel(role: CockpitStageRole): string {
  const keyMap: Record<CockpitStageRole, string> = {
    worker: 'stagent.webview.cockpit.roleWorker',
    verify: 'stagent.webview.cockpit.roleVerify',
    repairer: 'stagent.webview.cockpit.roleRepairer',
    engine: 'stagent.webview.cockpit.roleEngine',
    'engine-replan': 'stagent.webview.cockpit.roleEngineReplan',
    decision: 'stagent.webview.cockpit.roleDecision',
    other: 'stagent.webview.cockpit.roleOther',
  };
  return wMsg(keyMap[role]);
}
