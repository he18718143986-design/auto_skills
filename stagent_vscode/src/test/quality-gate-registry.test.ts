import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDefaultQualityGateRegistry,
  resetDefaultQualityGateRegistry,
  type QualityGate,
  type QualityGateContext,
} from '../QualityGate';
import { registerBuiltinQualityGates } from '../BuiltinQualityGates';
import {
  GATE_ID_DEBUG_FEEDBACK_LOOP,
  GATE_ID_POST_IMPL_STATIC_ANALYSIS,
  GATE_ID_RULE20_VIOLATIONS,
  GATE_ID_RUN_END_CONTRACT_LINT,
  GATE_ID_SCHEMA_VALIDATION,
} from '../QualityGateIds';
import { runQualityGates } from '../QualityGateRunner';

function ctx(overrides: Partial<QualityGateContext> = {}): QualityGateContext {
  return { phase: 'generate', ...overrides };
}

test('registerBuiltinQualityGates registers expected ids', () => {
  resetDefaultQualityGateRegistry();
  registerBuiltinQualityGates();
  const ids = getDefaultQualityGateRegistry().list().map((g) => g.id);
  assert.ok(ids.includes(GATE_ID_SCHEMA_VALIDATION));
  assert.ok(ids.includes(GATE_ID_RULE20_VIOLATIONS));
  assert.ok(ids.includes(GATE_ID_DEBUG_FEEDBACK_LOOP));
  assert.ok(ids.includes(GATE_ID_POST_IMPL_STATIC_ANALYSIS));
  assert.ok(ids.includes(GATE_ID_RUN_END_CONTRACT_LINT));
});

test('registry sorts gates by priority then id', () => {
  resetDefaultQualityGateRegistry();
  const registry = getDefaultQualityGateRegistry();
  registry.registerOrReplace({
    id: 'z-gate',
    label: 'z',
    phase: 'generate',
    priority: 50,
    evaluate: () => null,
  });
  registry.registerOrReplace({
    id: 'a-gate',
    label: 'a',
    phase: 'generate',
    priority: 50,
    evaluate: () => null,
  });
  registry.registerOrReplace({
    id: 'early',
    label: 'early',
    phase: 'generate',
    priority: 10,
    evaluate: () => null,
  });
  const ordered = registry.list('generate').map((g) => g.id);
  assert.deepEqual(ordered.slice(0, 3), ['early', 'a-gate', 'z-gate']);
});

test('run stops on first block by default', async () => {
  resetDefaultQualityGateRegistry();
  const registry = getDefaultQualityGateRegistry();
  const calls: string[] = [];
  const mk = (id: string, severity: 'block' | 'warn'): QualityGate => ({
    id,
    label: id,
    phase: 'pre-stage',
    priority: Number(id.replace(/\D/g, '') || '0'),
    evaluate: () => {
      calls.push(id);
      return { gateId: id, severity, messages: [id] };
    },
  });
  registry.registerOrReplace(mk('gate-10', 'block'));
  registry.registerOrReplace(mk('gate-20', 'warn'));
  const summary = await registry.run('pre-stage', ctx({ phase: 'pre-stage' }));
  assert.deepEqual(calls, ['gate-10']);
  assert.equal(summary.blocks.length, 1);
  assert.equal(summary.warnings.length, 0);
});

test('enabled hook skips gate', async () => {
  resetDefaultQualityGateRegistry();
  const registry = getDefaultQualityGateRegistry();
  registry.registerOrReplace({
    id: 'conditional',
    label: 'conditional',
    phase: 'generate',
    priority: 1,
    enabled: (c) => c.extras?.allow === true,
    evaluate: () => ({ gateId: 'conditional', severity: 'warn', messages: ['hit'] }),
  });
  const off = await registry.run('generate', ctx({ extras: { allow: false } }), {
    severities: ['warn'],
  });
  assert.equal(off.warnings.length, 0);
  const on = await registry.run('generate', ctx({ extras: { allow: true } }), {
    severities: ['warn'],
  });
  assert.equal(on.warnings.length, 1);
});

test('register throws on duplicate id', () => {
  resetDefaultQualityGateRegistry();
  const registry = getDefaultQualityGateRegistry();
  const gate: QualityGate = {
    id: 'dup',
    label: 'dup',
    phase: 'generate',
    priority: 1,
    evaluate: () => null,
  };
  registry.register(gate);
  assert.throws(() => registry.register(gate), /already registered/);
});

test('runQualityGates respects when filter for pre-stage', async () => {
  resetDefaultQualityGateRegistry();
  const registry = getDefaultQualityGateRegistry();
  registry.registerOrReplace({
    id: 'always-gate',
    label: 'always',
    phase: 'pre-stage',
    when: 'always',
    priority: 1,
    evaluate: () => ({ gateId: 'always-gate', severity: 'info', messages: ['a'] }),
  });
  registry.registerOrReplace({
    id: 'impl-gate',
    label: 'impl',
    phase: 'pre-stage',
    when: 'before-impl',
    priority: 2,
    evaluate: () => ({ gateId: 'impl-gate', severity: 'info', messages: ['i'] }),
  });
  const alwaysOnly = await runQualityGates('pre-stage', ctx({ phase: 'pre-stage' }), {
    when: 'always',
    stopOnBlock: false,
  });
  assert.deepEqual(
    alwaysOnly.results.map((r) => r.gateId),
    ['always-gate'],
  );
});
