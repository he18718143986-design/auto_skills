import type { SettingsProfileId } from './StagentSettingsProfiles';
import { buildProfileSummaryForUi } from './StagentProfileDiff';

/** 侧栏 / 确认页用：Profile 摘要 + 相对 default 的门禁差异。 */
export function buildProfileHighlights(profileId: SettingsProfileId | string): string[] {
  return buildProfileSummaryForUi(profileId);
}
