/** Re-export shim：磁盘引导已迁至 disk-bootstrap/*。 */
export {
  STAGE_INIT_NPM_WORKSPACE_ID,
  STAGENT_BUNDLE_WRITE_ID_SUFFIX,
  isStagentBundleWriteStage,
  patchNpmDefaultTestScriptAfterInit,
  injectInitNpmWorkspaceStage,
  injectFileWriteAfterImplStages,
  injectDeliveryWrapupStage,
  collectDeliverableFilePaths,
  DELIVERY_WRAPUP_STAGE_ID,
  injectSmokeStage,
  looksLikeServeCommand,
  SMOKE_RUN_STAGE_ID,
  applySoftwareDiskPipeline,
} from './disk-bootstrap';
