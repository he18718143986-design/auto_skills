import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { collectCharterFeedbackFromWorkflow } from '../charter/collectCharterFeedbackCandidates';
import { appendCharterFeedbackEntries, parseCharterFrontmatter } from '../charter/CharterWriter';
import { parseCharterMarkdown } from '../charter/CharterParser';
import type { Stage, StageRuntime, WorkflowDefinition } from '../WorkflowDefinition';

const SAMPLE_CHARTER = `---
charterVersion: 2
charterUpdatedAt: 2026-01-01T00:00:00.000Z
---

# 决策主旨（Charter）

## 优先（Prefer）
- 优先 headless 可测

## 避免（Avoid）
- 避免引入 GPL 依赖

## 约束（Constraints）

## 升级（Escalate）
`;

function decisionStage(id: string, title: string): Stage {
  return {
    id,
    title,
    tool: 'llm-text',
    isDecisionStage: true,
    toolConfig: { type: 'llm-text', systemPrompt: 'x' },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'decisionRecord', format: 'markdown' }],
    pauseAfter: true,
  };
}

test('collectCharterFeedbackFromWorkflow: includes human and excludes charter_direct', () => {
  const definition: WorkflowDefinition = {
    id: 'wf',
    version: '2.0',
    meta: { title: 't', taskType: 'prototype', userInput: 'u', createdAt: new Date().toISOString() },
    stages: [
      decisionStage('stage_decide_human', '人工架构拍板'),
      decisionStage('stage_decide_auto', '自动主旨项'),
    ],
  };
  const runtimes: StageRuntime[] = [
    {
      stageId: 'stage_decide_human',
      status: 'done',
      outputs: { decisionRecord: '采用事件驱动边界，模块间通过显式接口通信' },
      retryCount: 0,
      approvedDecisionRecord: '采用事件驱动边界，模块间通过显式接口通信',
      decisionProvenance: 'human',
    },
    {
      stageId: 'stage_decide_auto',
      status: 'done',
      outputs: { decisionRecord: '倾向：headless 可测' },
      retryCount: 0,
      approvedDecisionRecord: '倾向：headless 可测',
      decisionProvenance: 'charter_direct',
    },
  ];

  const items = collectCharterFeedbackFromWorkflow(definition, runtimes, SAMPLE_CHARTER, 'charter.md');
  assert.equal(items.length, 1);
  assert.equal(items[0]!.stageId, 'stage_decide_human');
  assert.equal(items[0]!.suggestedType, 'prefer');
});

test('collectCharterFeedbackFromWorkflow: skips duplicate charter text', () => {
  const definition: WorkflowDefinition = {
    id: 'wf',
    version: '2.0',
    meta: { title: 't', taskType: 'prototype', userInput: 'u', createdAt: new Date().toISOString() },
    stages: [decisionStage('stage_decide_x', '许可证')],
  };
  const runtimes: StageRuntime[] = [
    {
      stageId: 'stage_decide_x',
      status: 'done',
      outputs: { decisionRecord: '避免引入 GPL 依赖，改用 MIT 许可库' },
      retryCount: 0,
      approvedDecisionRecord: '避免引入 GPL 依赖，改用 MIT 许可库',
      decisionProvenance: 'human',
    },
  ];
  const items = collectCharterFeedbackFromWorkflow(definition, runtimes, SAMPLE_CHARTER, 'charter.md');
  assert.equal(items.length, 0);
});

test('appendCharterFeedbackEntries: appends rule and bumps charterVersion', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charter-feedback-'));
  const charterPath = path.join(dir, 'docs', 'agents', 'charter.md');
  fs.mkdirSync(path.dirname(charterPath), { recursive: true });
  fs.writeFileSync(charterPath, SAMPLE_CHARTER, 'utf8');

  const result = appendCharterFeedbackEntries(charterPath, [
    {
      type: 'prefer',
      text: '优先窄接口与可替换 adapter',
      stageId: 'stage_decide_human',
      provenance: 'human',
    },
  ]);

  assert.equal(result.previousVersion, 2);
  assert.equal(result.nextVersion, 3);
  assert.equal(result.appendedCount, 1);

  const raw = fs.readFileSync(charterPath, 'utf8');
  const fm = parseCharterFrontmatter(raw);
  assert.equal(fm.version, 3);
  assert.ok(raw.includes('优先窄接口与可替换 adapter'));

  const doc = parseCharterMarkdown(charterPath, raw);
  assert.ok(doc.prefers.some((r) => r.text.includes('窄接口')));
});
