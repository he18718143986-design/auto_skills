import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { parseCharterMarkdown } from '../charter/CharterParser';
import { buildDecisionBoardPayload } from '../decision-frontload/buildDecisionBoard';
import { applyFrontloadDecisionsToRuntimes } from '../decision-frontload/applyFrontloadDecisions';
import { shouldPauseAfterStage, buildHITLPolicy } from '../AdaptiveHITLPolicy';
import type { Stage, StageRuntime } from '../WorkflowDefinition';
import { PRIMARY_DECISION_OUTPUT_KEY } from '../WorkflowOutputKeys';

const SAMPLE_CHARTER = `# Charter

## 优先（Prefer）
- 优先 headless 可测

## 避免（Avoid）
- 避免为减文件数而合并 unrelated seam

## 约束（Constraints）
- 必须支持 node 18

## 升级（Escalate）
- 难逆转架构须问人
`;

test('buildDecisionBoardPayload: classifies decision stages with charter', () => {
  const charter = parseCharterMarkdown('c.md', SAMPLE_CHARTER);
  const stages: Stage[] = [
    {
      id: 'stage_decide_merge',
      title: '是否合并 unrelated seam',
      tool: 'llm-text',
      isDecisionStage: true,
      description: '减少文件数量是否合并 unrelated seam',
      toolConfig: { type: 'llm-text', systemPrompt: 'x' },
      input: { sources: [], mergeStrategy: 'concat' },
      outputs: [{ key: 'decisionRecord', format: 'markdown' }],
      pauseAfter: true,
    },
    {
      id: 'stage_decide_unknown',
      title: '选用哪家 CDN',
      tool: 'llm-text',
      isDecisionStage: true,
      toolConfig: { type: 'llm-text', systemPrompt: 'x' },
      input: { sources: [], mergeStrategy: 'concat' },
      outputs: [{ key: 'decisionRecord', format: 'markdown' }],
      pauseAfter: true,
    },
  ];
  const board = buildDecisionBoardPayload(stages, charter);
  assert.equal(board.summary.total, 2);
  assert.ok(board.summary.auto >= 1);
  assert.ok(board.summary.needsReview >= 1);
  const merge = board.items.find((i) => i.stageId === 'stage_decide_merge');
  assert.ok(merge);
  assert.ok(merge!.ruleRefs.length > 0);
});

test('applyFrontloadDecisionsToRuntimes: pre-seeds done + decision record', () => {
  const runtimes: StageRuntime[] = [
    { stageId: 'stage_decide_x', status: 'pending', outputs: {}, retryCount: 0 },
  ];
  const applied = applyFrontloadDecisionsToRuntimes(runtimes, [
    {
      stageId: 'stage_decide_x',
      decisionRecord: '选择 A',
      provenance: 'charter_direct',
    },
  ]);
  assert.deepEqual(applied, ['stage_decide_x']);
  assert.equal(runtimes[0]!.status, 'done');
  assert.equal(runtimes[0]!.approvedDecisionRecord, '选择 A');
  assert.equal(runtimes[0]!.decisionSource, 'frontload');
  assert.equal(runtimes[0]!.outputs[PRIMARY_DECISION_OUTPUT_KEY], '选择 A');
});

test('shouldPauseAfterStage: frontload-approved decision stage does not pause', () => {
  const stage: Stage = {
    id: 'stage_decide_x',
    title: 'x',
    tool: 'llm-text',
    isDecisionStage: true,
    toolConfig: { type: 'llm-text', systemPrompt: 'x' },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'decisionRecord', format: 'markdown' }],
    pauseAfter: false,
  };
  const runtime: StageRuntime = {
    stageId: 'stage_decide_x',
    status: 'done',
    outputs: { decisionRecord: 'ok' },
    retryCount: 0,
    approvedDecisionRecord: 'ok',
    decisionSource: 'frontload',
    decisionProvenance: 'charter_direct',
  };
  const policy = buildHITLPolicy({ decisionMode: 'frontloaded' });
  assert.equal(
    shouldPauseAfterStage(stage, runtime, { score: 0.9, level: 'high', reasons: [] }, policy),
    false,
  );
});
