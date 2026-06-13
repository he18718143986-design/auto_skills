import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { humanizeJargon } from '../friendly/TranslationGlossary';
import {
  plainCharterFeedbackDescription,
  plainDecisionBoardSummary,
  plainTaskTypeLabel,
} from '../friendly/toPlainLanguage';
import type { CharterFeedbackCandidate } from '../charter/CharterFeedbackTypes';

test('plainTaskTypeLabel maps known types', () => {
  assert.equal(plainTaskTypeLabel('software'), '完整软件交付');
  assert.equal(plainTaskTypeLabel('unknown'), 'unknown');
});

test('humanizeJargon replaces stage jargon', () => {
  const out = humanizeJargon('含 stage_zoom_out 与 TDD 流程');
  assert.ok(out.includes('工作区全景扫描'));
  assert.ok(out.includes('测试驱动'));
});

test('plainDecisionBoardSummary is readable', () => {
  const s = plainDecisionBoardSummary({
    stageTitle: '技术栈拍板',
    kind: 'uncovered',
    provenance: 'human',
    proposal: '使用 Python 3.11',
  });
  assert.ok(s.includes('技术栈拍板'));
  assert.ok(s.includes('主旨未覆盖'));
  assert.ok(s.includes('您亲自拍板'));
});

test('plainCharterFeedbackDescription humanizes candidate', () => {
  const c: CharterFeedbackCandidate = {
    stageId: 'stage_decide_x',
    stageTitle: '架构',
    decisionRecord: '优先 headless 可测',
    provenance: 'escalated',
    suggestedType: 'prefer',
    reason: '升级人工拍板',
  };
  const d = plainCharterFeedbackDescription(c);
  assert.ok(d.includes('主旨未覆盖'));
  assert.ok(d.includes('优先 headless'));
});
