import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  assembleSkillSystemPrompt,
  buildEscalationInstruction,
} from '../SkillPromptAssembler';
import type { SkillSource } from '../SkillRegistry';

function skill(content: string, ref = 'grill-with-docs'): SkillSource {
  return { ref, skillMdPath: `/x/${ref}/SKILL.md`, content, version: 'abc123', subFiles: {} };
}

test('SKILL.md 原文逐字置顶（保真）', () => {
  const body = '# grill-with-docs\nAsk one question at a time. Stress-test the plan.';
  const out = assembleSkillSystemPrompt(skill(body));
  assert.ok(out.startsWith(body.trim()));
  assert.ok(out.includes('Ask one question at a time'));
});

test('Context Bundle 各节按提供情况注入', () => {
  const out = assembleSkillSystemPrompt(skill('# s'), {
    userTask: '做一个登录功能',
    charter: '优先稳定性；避免新依赖',
    contextMd: 'Board: 看板',
    adrs: 'ADR-0001 使用 JWT',
    autoAnswerMode: 'suggest',
  });
  assert.ok(out.includes('## Platform Context Bundle'));
  assert.ok(out.includes('做一个登录功能'));
  assert.ok(out.includes('优先稳定性'));
  assert.ok(out.includes('Board: 看板'));
  assert.ok(out.includes('ADR-0001'));
});

test('空 bundle 不产出 Context Bundle 段', () => {
  const out = assembleSkillSystemPrompt(skill('# s'));
  assert.equal(out.includes('## Platform Context Bundle'), false);
  assert.ok(out.includes('## Auto-Answer Policy'));
});

test('off 模式：不替用户回答', () => {
  const t = buildEscalationInstruction('off');
  assert.ok(t.includes('off'));
  assert.ok(t.includes('一次一个问题'));
});

test('auto-with-escalation：含不可绕过的升级闸门三条', () => {
  const t = buildEscalationInstruction('auto-with-escalation');
  assert.ok(t.includes('MustEscalateToHuman'));
  assert.ok(t.includes('ADR 判据'));
  assert.ok(t.includes('约束'));
  assert.ok(t.includes('置信度低'));
  assert.ok(t.includes('provenance'));
});

test('suggest：要求给推荐答案并标注来源', () => {
  const t = buildEscalationInstruction('suggest');
  assert.ok(t.includes('推荐答案'));
  assert.ok(t.includes('provenance'));
});

test('溯源注释含 ref/version/mode', () => {
  const out = assembleSkillSystemPrompt(skill('# s', 'tdd'), { autoAnswerMode: 'suggest' });
  assert.ok(out.includes('skill-invoke: ref=tdd version=abc123 mode=suggest'));
});

test('singleShotGrill：注入单轮输出契约（要求立即给第一个问题 + 推荐答案），否则不注入', () => {
  const off = assembleSkillSystemPrompt(skill('# s'));
  assert.equal(off.includes('单轮输出契约'), false);

  const on = assembleSkillSystemPrompt(skill('# s'), { singleShotGrill: true });
  assert.ok(on.includes('单轮输出契约'));
  assert.ok(on.includes('推荐'));
  assert.ok(on.includes('延迟表述'));
  // 显式禁止工具调用（修复 native 在裸 chat 调用里尝试 read_file 而卡住）
  assert.ok(on.includes('没有任何可用工具'));
  assert.ok(on.includes('read_file'));
});
