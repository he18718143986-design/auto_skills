import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  analyzePythonModuleDepth,
  applyModuleDepthPenaltyToQualityScore,
  classifyDepthRatio,
  classifyLeverage,
  collectModuleDepthWarnings,
  formatModuleDepthWarning,
  moduleDepthPenalty,
  scoreModuleDepth,
  scoreModuleDepthByLeverage,
} from '../ModuleDepthScorer';
import { scoreStatically } from '../OutputQualityScorer';

test('classifyDepthRatio：阈值分类', () => {
  assert.equal(classifyDepthRatio(12), 'deep');
  assert.equal(classifyDepthRatio(6), 'moderate');
  assert.equal(classifyDepthRatio(2), 'shallow');
});

test('scoreModuleDepth：深模块高分', () => {
  const r = scoreModuleDepth({ publicSymbolCount: 1, implementationLines: 60 });
  assert.equal(r.classification, 'deep');
  assert.equal(r.score, 1);
});

test('scoreModuleDepth：浅模块（接口面≈实现）低分', () => {
  const r = scoreModuleDepth({ publicSymbolCount: 8, implementationLines: 16 });
  assert.equal(r.classification, 'shallow');
  assert.equal(r.score, 0.3);
});

test('scoreModuleDepth：体量过小给中性分（不误判浅）', () => {
  const r = scoreModuleDepth({ publicSymbolCount: 3, implementationLines: 5 });
  assert.equal(r.classification, 'moderate');
});

test('moduleDepthPenalty：仅浅模块惩罚', () => {
  assert.equal(moduleDepthPenalty({ ratio: 2, classification: 'shallow', score: 0.3 }), 0.3);
  assert.equal(moduleDepthPenalty({ ratio: 12, classification: 'deep', score: 1 }), 0);
});

test('analyzePythonModuleDepth：薄包装识别为浅', () => {
  const content = `import os

def a(x):
    return _impl(x)

def b(x):
    return _impl(x)

def c(x):
    return _impl(x)

def d(x):
    return _impl(x)

def e(x):
    return _impl(x)

def f(x):
    return _impl(x)

def g(x):
    return _impl(x)
`;
  const r = analyzePythonModuleDepth(content);
  assert.equal(r.classification, 'shallow');
  assert.ok(formatModuleDepthWarning('wrap.py', r)?.startsWith('architecture:shallow-module'));
});

test('analyzePythonModuleDepth：单一接口大实现识别为深', () => {
  const body = Array.from({ length: 40 }, (_, i) => `    step_${i} = compute(${i})`).join('\n');
  const content = `def process(data):\n${body}\n    return aggregate(data)\n`;
  const r = analyzePythonModuleDepth(content);
  assert.equal(r.classification, 'deep');
  assert.equal(formatModuleDepthWarning('deep.py', r), undefined);
});

test('#14 collectModuleDepthWarnings：浅模块产出 architecture warning', () => {
  const content = `import os

def a(x):
    return _impl(x)

def b(x):
    return _impl(x)

def c(x):
    return _impl(x)

def d(x):
    return _impl(x)

def e(x):
    return _impl(x)

def f(x):
    return _impl(x)

def g(x):
    return _impl(x)
`;
  const warnings = collectModuleDepthWarnings([{ path: 'wrap.py', content }]);
  assert.equal(warnings.length, 1);
  assert.ok(warnings[0].startsWith('architecture:shallow-module:wrap.py'));
});

test('classifyLeverage：杠杆阈值分类', () => {
  assert.equal(classifyLeverage(8), 'deep');
  assert.equal(classifyLeverage(3), 'moderate');
  assert.equal(classifyLeverage(1), 'shallow');
});

test('scoreModuleDepthByLeverage：杠杆语义（窄接口大行为=深）', () => {
  const r = scoreModuleDepthByLeverage({
    publicSymbolCount: 1,
    implementationLines: 40,
    behaviorUnits: 36,
    interfaceCost: 1.25,
  });
  assert.equal(r.classification, 'deep');
  assert.ok((r.leverage ?? 0) >= 6);
});

test('scoreModuleDepthByLeverage：behaviorUnits 缺省时回退比值法（向后兼容）', () => {
  const r = scoreModuleDepthByLeverage({ publicSymbolCount: 1, implementationLines: 60 });
  assert.equal(r.classification, 'deep');
  assert.equal(r.leverage, undefined);
});

test('depth-as-leverage 修正：灌水/透传链不再被误判为深', () => {
  // 窄接口（1 个公共 facade）+ 大量透传委托：旧的「实现行/接口」比值会判 deep（实现行多、接口=1），
  // 杠杆语义只数真正行为（透传 return 不计）→ behaviorUnits≈0 → 正确判为 shallow。
  const content = `def facade(x):
    return _a(x)

def _a(x):
    return _b(x)

def _b(x):
    return _c(x)

def _c(x):
    return _d(x)

def _d(x):
    return _e(x)

def _e(x):
    return _f(x)

def _f(x):
    return x
`;
  const byRatio = scoreModuleDepth({ publicSymbolCount: 1, implementationLines: 13 });
  assert.equal(byRatio.classification, 'deep'); // 旧框架（比值）会误判为深
  const r = analyzePythonModuleDepth(content);
  assert.equal(r.classification, 'shallow'); // 杠杆框架正确判浅
  assert.ok(formatModuleDepthWarning('facade.py', r)?.includes('杠杆'));
});

test('#14 applyModuleDepthPenaltyToQualityScore 浅模块降分', () => {
  const shallow = Array.from({ length: 20 }, (_, i) => `def f${i}(): return ${i}`).join('\n');
  const base = scoreStatically(
    {
      id: 'stage_impl_x',
      title: 'x',
      tool: 'llm-text',
      toolConfig: { type: 'llm-text', systemPrompt: 'x' },
      input: { sources: [{ type: 'user-input', label: 'x' }], mergeStrategy: 'concat' },
      outputs: [{ key: 'o', format: 'text' }],
      pauseAfter: false,
    },
    shallow,
    { id: 'wf', version: '2.0', meta: { title: 't', taskType: 'prototype', userInput: 'x', createdAt: '' }, stages: [] },
  );
  const penalized = applyModuleDepthPenaltyToQualityScore(base, shallow);
  assert.ok(penalized.overall < base.overall);
  assert.ok(penalized.issues.some((i) => i.code === 'architecture:shallow-module'));
});
