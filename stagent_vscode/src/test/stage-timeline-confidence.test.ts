import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  confidenceLabel,
  confidenceWarn,
  formatConfidenceBar,
} from '../webview/shared/execTimelineConfidence';

test('formatConfidenceBar clamps score to 0-5 blocks', () => {
  assert.match(formatConfidenceBar(0), /^\[□{5}\]/);
  assert.match(formatConfidenceBar(1), /^\[■{5}\]/);
  assert.match(formatConfidenceBar(0.5), /0\.50$/);
});

test('confidenceWarn adds warning for low/critical', () => {
  assert.equal(confidenceWarn('high'), '');
  assert.equal(confidenceWarn('low'), ' ⚠');
  assert.equal(confidenceWarn('critical'), ' ⚠');
});

test('confidenceLabel combines bar and warn', () => {
  const label = confidenceLabel({ score: 0.2, level: 'low', reasons: ['r1'] });
  assert.ok(label.includes('⚠'));
  assert.ok(label.includes('0.20'));
});

test('renderExecTimeline always calls renderExecDagGraph (regression guard)', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'webview', 'runtime', 'view-exec-stage-list.ts'),
    'utf8',
  );
  assert.match(src, /mountStageTimeline\(/);
  assert.match(src, /renderExecDagGraph\(/);
  assert.doesNotMatch(src, /renderExecTimelineVanilla/);
  assert.doesNotMatch(src, /typeof mountStageTimeline/);
});
