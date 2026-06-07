import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import type { InputSource } from '../WorkflowDefinition';
import { PRIMARY_DECISION_OUTPUT_KEY } from '../WorkflowOutputKeys';
import {
  filterStageOutputSources,
  hasStageOutputSource,
  implHasDecisionRecordSourceForStages,
  implHasDecisionRecordSourcePlanWide,
  implHasDecisionRecordSourceStrict,
} from '../workflow/StageInputSources';

const sources: InputSource[] = [
  { type: 'stage-output', stageId: 'stage_decide_auth', outputKey: PRIMARY_DECISION_OUTPUT_KEY },
  { type: 'stage-output', stageId: 'stage_impl_auth', outputKey: PRIMARY_DECISION_OUTPUT_KEY },
  { type: 'stage-output', stageId: 'stage_decide_auth', outputKey: 'hypothesis' },
  { type: 'user-input' },
];

test('hasStageOutputSource exact stageId', () => {
  assert.equal(
    hasStageOutputSource(sources, { stageId: 'stage_decide_auth' }),
    true,
  );
  assert.equal(
    hasStageOutputSource(sources, { stageId: 'stage_missing' }),
    false,
  );
});

test('hasStageOutputSource requireDecideStageId strict mode', () => {
  assert.equal(
    hasStageOutputSource(sources, { requireDecideStageId: true }),
    true,
  );
  const looseOnly: InputSource[] = [
    { type: 'stage-output', stageId: 'custom_stage', outputKey: PRIMARY_DECISION_OUTPUT_KEY },
  ];
  assert.equal(
    hasStageOutputSource(looseOnly, { requireDecideStageId: true }),
    false,
  );
});

test('hasStageOutputSource requireNonEmptyStageId wide plan mode', () => {
  const wide: InputSource[] = [
    { type: 'stage-output', stageId: 'custom_stage', outputKey: PRIMARY_DECISION_OUTPUT_KEY },
  ];
  assert.equal(
    hasStageOutputSource(wide, { requireNonEmptyStageId: true }),
    true,
  );
  assert.equal(
    hasStageOutputSource(
      [{ type: 'stage-output', stageId: '', outputKey: PRIMARY_DECISION_OUTPUT_KEY }],
      { requireNonEmptyStageId: true },
    ),
    false,
  );
});

test('filterStageOutputSources returns matching subset', () => {
  const matched = filterStageOutputSources(sources, { requireDecideStageId: true });
  assert.equal(matched.length, 1);
  assert.equal(matched[0]?.stageId, 'stage_decide_auth');
});

test('impl decision helpers mirror strict / plan-wide / allowedStageIds modes', () => {
  const looseOnly: InputSource[] = [
    { type: 'stage-output', stageId: 'custom_stage', outputKey: PRIMARY_DECISION_OUTPUT_KEY },
  ];
  assert.equal(implHasDecisionRecordSourceStrict(sources), true);
  assert.equal(implHasDecisionRecordSourceStrict(looseOnly), false);
  assert.equal(implHasDecisionRecordSourcePlanWide(looseOnly), true);
  assert.equal(
    implHasDecisionRecordSourceForStages(looseOnly, ['custom_stage']),
    true,
  );
  assert.equal(
    implHasDecisionRecordSourceForStages(looseOnly, ['other_stage']),
    false,
  );
});
