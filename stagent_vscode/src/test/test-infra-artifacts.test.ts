import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { testInfraSatisfied } from '../test-infra/artifacts';

test('testInfraSatisfied: expo requires jest and babel', () => {
  assert.equal(testInfraSatisfied(true, { jest: true, babel: true, tsconfig: false }), true);
  assert.equal(testInfraSatisfied(true, { jest: true, babel: false, tsconfig: true }), false);
  assert.equal(testInfraSatisfied(true, { jest: false, babel: false, tsconfig: true }), false);
});

test('testInfraSatisfied: non-expo accepts any one of jest/babel/tsconfig', () => {
  assert.equal(testInfraSatisfied(false, { jest: false, babel: false, tsconfig: false }), false);
  assert.equal(testInfraSatisfied(false, { jest: true, babel: false, tsconfig: false }), true);
  assert.equal(testInfraSatisfied(false, { jest: false, babel: true, tsconfig: false }), true);
  assert.equal(testInfraSatisfied(false, { jest: false, babel: false, tsconfig: true }), true);
});
