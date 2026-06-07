import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  formatWorkflowGeneratedWarningsForDisplay,
  formatWorkflowWarningForDisplay,
  parseWorkflowWarningLine,
} from '../Rule20WarningDisplay';

test('parseWorkflowWarningLine recognizes rule20 tokens', () => {
  assert.deepEqual(parseWorkflowWarningLine('rule20:missing-decision-stage:stage_impl_x'), {
    kind: 'rule20-violation',
    type: 'missing-decision-stage',
    stageId: 'stage_impl_x',
  });
  assert.deepEqual(parseWorkflowWarningLine('rule20-soft:model-tier-downgrade:workflow'), {
    kind: 'rule20-soft',
    type: 'model-tier-downgrade',
    stageId: 'workflow',
  });
  assert.deepEqual(parseWorkflowWarningLine('stage_count_near_limit'), {
    kind: 'builtin',
    type: 'stage_count_near_limit',
  });
});

test('formatWorkflowWarningForDisplay humanizes violations and soft warnings', () => {
  const violationLine = formatWorkflowWarningForDisplay('rule20:missing-decision-stage:stage_impl_a');
  assert.match(violationLine, /Rule20|stagent\.rule20\.display\.violationPrefix/);
  assert.match(violationLine, /stage_impl_a/);
  const softLine = formatWorkflowWarningForDisplay('rule20-soft:model-tier-downgrade:workflow');
  assert.match(softLine, /Rule20|stagent\.rule20\.display\.softPrefix/);
  const builtinLine = formatWorkflowWarningForDisplay('stage_count_near_limit');
  assert.match(builtinLine, /45|stagent\.rule20\.label\.stage_count_near_limit/);
});

test('formatWorkflowGeneratedWarningsForDisplay preserves order', () => {
  const lines = formatWorkflowGeneratedWarningsForDisplay([
    'stage_count_near_limit',
    'rule20:broken-naming-pair:stage_impl_x',
  ]);
  assert.equal(lines.length, 2);
  assert.match(lines[0], /45|stage_count_near_limit/);
  assert.match(lines[1], /naming|brokenNamingPair|broken-naming-pair/);
});
