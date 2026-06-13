import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  aggregateGrillProvenance,
  canAutoFillFromCharterMatch,
  formatGrillAnswerFromCharter,
  recordCharterQuestionProvenance,
  syncDecisionProvenanceFromGrill,
  tryCharterAnswerForQuestionWithDoc,
} from '../charter/CharterGrillAutoAnswer';
import { parseCharterMarkdown } from '../charter/CharterParser';
import type { StageRuntime } from '../WorkflowDefinition';

const CHARTER = parseCharterMarkdown(
  'c.md',
  `## 避免（Avoid）
- 避免为减文件数而合并 unrelated seam
## 约束（Constraints）
- 必须支持 node 18 运行时`,
);

test('canAutoFillFromCharterMatch: suggest allows inferred, blocks escalated', () => {
  assert.equal(
    canAutoFillFromCharterMatch(
      {
        kind: 'lowconf',
        provenance: 'charter_inferred',
        matchScore: 0.7,
        conflictScore: 0,
        ruleRefs: [2],
        proposal: '倾向：不要合并 seam',
      },
      'suggest',
    ),
    true,
  );
  assert.equal(
    canAutoFillFromCharterMatch(
      { kind: 'uncovered', provenance: 'escalated', matchScore: 0, conflictScore: 0, ruleRefs: [] },
      'suggest',
    ),
    false,
  );
});

test('formatGrillAnswerFromCharter includes provenance tag', () => {
  const text = formatGrillAnswerFromCharter({
    kind: 'auto',
    provenance: 'charter_direct',
    matchScore: 1,
    conflictScore: 0,
    ruleRefs: [2],
    proposal: '不要合并 seam',
    reasoning: '主旨直接命中',
  });
  assert.match(text, /\[provenance: charter_direct/);
  assert.match(text, /R#2/);
});

test('aggregateGrillProvenance: inferred beats direct', () => {
  assert.equal(
    aggregateGrillProvenance({
      q1: 'charter_direct',
      q2: 'charter_inferred',
    }),
    'charter_inferred',
  );
});

test('tryCharterAnswerForQuestionWithDoc: suggest returns match without silent fill', () => {
  const attempt = tryCharterAnswerForQuestionWithDoc(
    { id: 'q1', text: '是否应该合并 unrelated seam 来减文件？' },
    CHARTER,
    'suggest',
  );
  assert.ok(attempt);
  assert.equal(attempt!.filled, false);
  assert.equal(attempt!.answer, undefined);
  assert.equal(attempt!.match.provenance, 'charter_direct');
});

test('syncDecisionProvenanceFromGrill: writes stage provenance from per-question map', () => {
  const runtime: Pick<StageRuntime, 'questionBeforeAnswers' | 'charterQuestionProvenance' | 'decisionProvenance'> =
    {};
  const attempt = tryCharterAnswerForQuestionWithDoc(
    { id: 'q1', text: '是否应该合并 unrelated seam？' },
    CHARTER,
    'auto-with-escalation',
  );
  assert.ok(attempt?.filled);
  runtime.questionBeforeAnswers = { q1: attempt!.answer! };
  recordCharterQuestionProvenance(runtime, 'q1', attempt!.match.provenance);
  syncDecisionProvenanceFromGrill(runtime);
  assert.equal(runtime.decisionProvenance, 'charter_direct');
});
