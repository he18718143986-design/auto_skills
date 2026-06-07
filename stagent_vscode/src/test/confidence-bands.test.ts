import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  CONFIDENCE_LEVEL_HIGH_MIN,
  CONFIDENCE_LEVEL_MEDIUM_MIN,
  scoreToConfidenceLevel,
} from '../ConfidenceBands';

test('scoreToConfidenceLevel boundaries', () => {
  assert.equal(scoreToConfidenceLevel(CONFIDENCE_LEVEL_HIGH_MIN), 'high');
  assert.equal(scoreToConfidenceLevel(CONFIDENCE_LEVEL_HIGH_MIN - 0.001), 'medium');
  assert.equal(scoreToConfidenceLevel(CONFIDENCE_LEVEL_MEDIUM_MIN), 'medium');
  assert.equal(scoreToConfidenceLevel(CONFIDENCE_LEVEL_MEDIUM_MIN - 0.001), 'low');
});
