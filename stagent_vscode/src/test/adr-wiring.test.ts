import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  buildAdrRecordFromDecision,
  formatAdrIndexForPrompt,
  isGlobalArchitectureDecisionStage,
  shouldCreateAdr,
} from '../AdrStore';
import {
  buildAdrContextForWorkspace,
  persistAdrOnDecisionApprove,
  resolveAdrDir,
} from '../AdrPersistence';
import { readTextFile } from '../FsAsync';

function tempWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'stagent-adr-wire-'));
}

test('#13 shouldCreateAdr：全局架构决策必落 ADR', () => {
  const r = shouldCreateAdr({
    stageId: 'stage_decide_global_architecture',
    stageTitle: '全局架构',
    decisionRecord: '简短决策',
  });
  assert.equal(r.create, true);
  assert.equal(isGlobalArchitectureDecisionStage('stage_decide_global_architecture'), true);
});

test('#13 shouldCreateAdr：三门至少两门才 create', () => {
  const weak = shouldCreateAdr({
    stageId: 'stage_clarify_scope',
    stageTitle: '澄清范围',
    decisionRecord: '本阶段只确认输入范围，不涉及技术选型',
  });
  assert.equal(weak.create, false);

  const strong = shouldCreateAdr({
    stageId: 'stage_decide_cache',
    stageTitle: '缓存策略',
    decisionRecord: '长期架构权衡：Redis vs 本地内存，迁移成本高，跨模块接口契约需统一',
  });
  assert.equal(strong.create, true);
  assert.ok(strong.reasons.length >= 2);
});

test('#13 persistAdrOnDecisionApprove 写入 .stagent/adr/', async () => {
  const ws = tempWorkspace();
  const decisionRecord = [
    '### 职责边界',
    '负责缓存层',
    '',
    '### 关键设计决策',
    '采用 Redis，长期不可逆',
    '',
    '### 边界压力测试',
    'QPS 翻倍时仍可用',
  ].join('\n');
  const result = await persistAdrOnDecisionApprove(ws, {
    stageId: 'stage_decide_cache',
    stageTitle: '缓存架构决策',
    decisionRecord,
  });
  assert.equal(result.written, true);
  const adrPath = result.filePath!;
  assert.ok(adrPath.includes('.stagent/adr/'));
  const raw = await readTextFile(adrPath);
  assert.ok(raw.includes('# 0001.'));
  assert.ok(raw.includes('Redis'));
});

test('#13 buildAdrContextForWorkspace 汇总已有 ADR', async () => {
  const ws = tempWorkspace();
  const adrDir = resolveAdrDir(ws);
  fs.mkdirSync(adrDir, { recursive: true });
  fs.writeFileSync(
    path.join(adrDir, '0001-use-redis.md'),
    '# 0001. Use Redis\n\n- Status: accepted\n\n## Decision\n\nUse Redis\n',
    'utf-8',
  );
  const ctx = await buildAdrContextForWorkspace(ws);
  assert.ok(ctx.includes('ADR-0001'));
  assert.ok(formatAdrIndexForPrompt([{ number: 1, title: 'Use Redis', status: 'accepted' }]).includes('accepted'));
});

test('#13 buildAdrRecordFromDecision 映射 ### 章节', () => {
  const adr = buildAdrRecordFromDecision({
    stageId: 'stage_decide_x',
    stageTitle: 'X 决策',
    decisionRecord: '### 关键设计决策\n\n选 A\n\n### 边界压力测试\n\n压力 1',
    number: 2,
    date: '2026-05-31',
  });
  assert.equal(adr.number, 2);
  assert.ok(adr.decision.includes('选 A'));
  assert.ok(adr.consequences.includes('压力 1'));
});
