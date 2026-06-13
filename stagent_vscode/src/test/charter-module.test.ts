import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { matchCharterToDecision, mustPauseForCharterProvenance } from '../charter/CharterAnswerRouter';
import { buildCharterConstraintsBlock } from '../charter/CharterConstraintsBlock';
import { parseCharterMarkdown } from '../charter/CharterParser';
import { evaluateHITL, shouldPauseAfterStage, DEFAULT_HITL_POLICY } from '../AdaptiveHITLPolicy';
import type { Stage, StageRuntime } from '../WorkflowDefinition';

const SAMPLE_CHARTER = `# 决策主旨（Charter）

## 优先（Prefer）
- 优先 headless 可测、interface 变窄
- 优先语义清晰的显式方法

## 避免（Avoid）
- 避免为减文件数而合并 unrelated seam
- 避免引入 GPL 依赖

## 约束（Constraints）
- 必须支持 node 18 运行时

## 升级（Escalate）
- 任何难逆转的架构决策必须问人
`;

test('parseCharterMarkdown: extracts quadrants', () => {
  const doc = parseCharterMarkdown('charter.md', SAMPLE_CHARTER);
  assert.equal(doc.prefers.length, 2);
  assert.equal(doc.avoids.length, 2);
  assert.equal(doc.constraints.length, 1);
  assert.equal(doc.escalationRules.length, 1);
  assert.ok(doc.prefers[0]!.keywords.includes('headless'));
});

test('buildCharterConstraintsBlock: injects avoid and constraint only', () => {
  const doc = parseCharterMarkdown('c.md', SAMPLE_CHARTER);
  const block = buildCharterConstraintsBlock(doc);
  assert.ok(block);
  assert.match(block!, /避免/);
  assert.match(block!, /约束/);
  assert.doesNotMatch(block!, /优先 headless/);
});

test('matchCharterToDecision: direct hit on avoid question', () => {
  const doc = parseCharterMarkdown('c.md', SAMPLE_CHARTER);
  const m = matchCharterToDecision('是否应该合并 unrelated seam 来减少文件数？', doc, 0.9);
  assert.ok(m.matchScore >= 0.6);
  assert.ok(['charter_direct', 'charter_inferred'].includes(m.provenance));
  assert.ok(m.ruleRefs.length > 0);
});

test('matchCharterToDecision: uncovered when no keyword overlap', () => {
  const doc = parseCharterMarkdown('c.md', SAMPLE_CHARTER);
  const m = matchCharterToDecision('选用 Kotlin 还是 Swift？', doc, 0.9);
  assert.equal(m.kind, 'uncovered');
  assert.equal(m.provenance, 'escalated');
});

test('mustPauseForCharterProvenance: suggest blocks inferred and direct', () => {
  assert.equal(mustPauseForCharterProvenance('charter_inferred', 'suggest'), true);
  assert.equal(mustPauseForCharterProvenance('charter_direct', 'suggest'), true);
  assert.equal(mustPauseForCharterProvenance('charter_inferred', 'auto-with-escalation'), false);
  assert.equal(mustPauseForCharterProvenance('human', 'suggest'), false);
});

test('AdaptiveHITL: charter_inferred pauses in suggest mode on decision stage', () => {
  const stage: Stage = {
    id: 'stage_decide_x',
    title: 'x',
    tool: 'llm-text',
    toolConfig: { type: 'llm-text', systemPrompt: 'd' },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'decisionRecord', format: 'markdown' }],
    pauseAfter: false,
    isDecisionStage: true,
  };
  const runtime: StageRuntime = {
    stageId: stage.id,
    status: 'running',
    outputs: {},
    retryCount: 0,
    decisionProvenance: 'charter_inferred',
  };
  const policy = { ...DEFAULT_HITL_POLICY, charterAutoAnswerMode: 'suggest' as const };
  const confidence = { score: 0.9, level: 'high' as const, reasons: [] };
  const decision = evaluateHITL(stage, runtime, confidence, policy);
  assert.equal(decision.action, 'pause');
  assert.equal(shouldPauseAfterStage(stage, runtime, confidence, policy), true);
});

test('AdaptiveHITL: charter_direct auto-advances in auto-with-escalation', () => {
  const stage: Stage = {
    id: 'stage_decide_x',
    title: 'x',
    tool: 'llm-text',
    toolConfig: { type: 'llm-text', systemPrompt: 'd' },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'decisionRecord', format: 'markdown' }],
    pauseAfter: false,
    isDecisionStage: true,
  };
  const runtime: StageRuntime = {
    stageId: stage.id,
    status: 'running',
    outputs: {},
    retryCount: 0,
    decisionProvenance: 'charter_direct',
  };
  const policy = { ...DEFAULT_HITL_POLICY, charterAutoAnswerMode: 'auto-with-escalation' as const };
  assert.equal(
    shouldPauseAfterStage(stage, runtime, { score: 0.9, level: 'high', reasons: [] }, policy),
    false,
  );
});
