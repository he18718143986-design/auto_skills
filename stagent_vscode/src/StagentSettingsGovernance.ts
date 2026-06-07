/**
 * M43：配置项治理门面 — 域分组、预设 Profile、矛盾组合检测。
 */
export type { SettingsDomain, SettingDomainEntry } from './StagentSettingsCatalog';
export { SETTINGS_DOMAIN_CATALOG } from './StagentSettingsCatalog';

export type { SettingsProfileId, SettingsProfileSpec } from './StagentSettingsProfiles';
export {
  SETTINGS_PROFILES,
  getSettingsProfile,
  getSettingsProfileOverrides,
} from './StagentSettingsProfiles';

export type { SettingsValidationIssue, SettingsValidationSeverity } from './StagentSettingsValidation';
export { validateSettings, formatSettingsValidationReport } from './StagentSettingsValidation';
