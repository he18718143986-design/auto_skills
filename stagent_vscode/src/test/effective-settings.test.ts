import assert from 'node:assert';
import test from 'node:test';
import {
  resolveEffectiveBoolean,
  resolveEffectiveDecisionContentLint,
  resolveEffectiveDagMaxParallelism,
  resolveEffectiveGlobalDecisionInjectMode,
  resolveEffectiveInjectApprovedDecisionContext,
} from '../EffectiveSettings';

test('resolveEffectiveBoolean: workflow overrides vscode', () => {
  assert.equal(resolveEffectiveBoolean(undefined, true), true);
  assert.equal(resolveEffectiveBoolean(false, true), false);
  assert.equal(resolveEffectiveBoolean(true, false), true);
});

test('resolveEffectiveDecisionContentLint: tri-state', () => {
  assert.equal(resolveEffectiveDecisionContentLint(undefined, true), true);
  assert.equal(resolveEffectiveDecisionContentLint(undefined, false), false);
  assert.equal(resolveEffectiveDecisionContentLint({ enableDecisionContentLint: false }, true), false);
  assert.equal(resolveEffectiveDecisionContentLint({ enableDecisionContentLint: true }, false), true);
});

test('resolveEffectiveInjectApprovedDecisionContext', () => {
  assert.equal(resolveEffectiveInjectApprovedDecisionContext({ injectApprovedDecisionContext: false }, true), false);
  assert.equal(resolveEffectiveInjectApprovedDecisionContext({}, false), false);
});

test('resolveEffectiveGlobalDecisionInjectMode', () => {
  assert.equal(resolveEffectiveGlobalDecisionInjectMode({ globalDecisionInjectMode: 'full' }, 'summary'), 'full');
  assert.equal(resolveEffectiveGlobalDecisionInjectMode({}, 'summary'), 'summary');
});

test('resolveEffectiveDagMaxParallelism', () => {
  assert.equal(resolveEffectiveDagMaxParallelism({ dagMaxParallelism: 4 }, 2), 4);
  assert.equal(resolveEffectiveDagMaxParallelism({}, 2), 2);
});
