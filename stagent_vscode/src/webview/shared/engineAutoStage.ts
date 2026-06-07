import {
  STAGE_INIT_NPM_WORKSPACE_ID,
  STAGENT_BUNDLE_WRITE_ID_SUFFIX,
  isStagentBundleWriteStage,
} from '../../disk-bootstrap/constants';

export { STAGE_INIT_NPM_WORKSPACE_ID, isStagentBundleWriteStage };

export function isEngineAutoInjectedStageId(stageId: string): boolean {
  return stageId === STAGE_INIT_NPM_WORKSPACE_ID || isStagentBundleWriteStage({ id: stageId });
}

export function bundleWriteParentStageId(bundleStageId: string): string | null {
  if (!bundleStageId.endsWith(STAGENT_BUNDLE_WRITE_ID_SUFFIX)) {
    return null;
  }
  return bundleStageId.slice(0, -STAGENT_BUNDLE_WRITE_ID_SUFFIX.length);
}
