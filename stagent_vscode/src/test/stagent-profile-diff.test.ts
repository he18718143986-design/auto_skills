import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildProfileGateDiff, buildProfileSummaryForUi } from '../StagentProfileDiff';

test('buildProfileGateDiff empty for default', () => {
  assert.deepEqual(buildProfileGateDiff('default'), []);
});

test('buildProfileSummaryForUi includes strict gates', () => {
  const lines = buildProfileSummaryForUi('strict');
  assert.ok(lines.length >= 2);
  assert.ok(lines.some((l) => l.includes('Strict') || l.includes('strict') || l.includes('红绿')));
});
