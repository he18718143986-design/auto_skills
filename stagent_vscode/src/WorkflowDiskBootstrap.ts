/** Re-export shim：磁盘引导已迁至 disk-bootstrap/*。 */
export {
  STAGE_INIT_NPM_WORKSPACE_ID,
  STAGENT_BUNDLE_WRITE_ID_SUFFIX,
  isStagentBundleWriteStage,
  patchNpmDefaultTestScriptAfterInit,
  injectInitNpmWorkspaceStage,
  injectFileWriteAfterImplStages,
  applySoftwareDiskPipeline,
} from './disk-bootstrap';
