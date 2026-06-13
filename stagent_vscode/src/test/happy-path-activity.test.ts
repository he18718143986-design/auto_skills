import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  happyPathEngineActivityKind,
  happyPathEngineActivityText,
} from '../engine-activity/happyPathActivity';
import type { Stage } from '../WorkflowDefinition';

function stage(id: string, extra: Partial<Stage> = {}): Stage {
  return {
    id,
    title: id,
    tool: 'llm-text',
    toolConfig: { type: 'llm-text', systemPrompt: 'x' },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'main', format: 'text' }],
    pauseAfter: false,
    ...extra,
  };
}

test('happyPathEngineActivityKind uses verify for test_write', () => {
  assert.equal(happyPathEngineActivityKind(stage('stage_test_write_x')), 'verify');
});

test('happyPathEngineActivityText mentions RED for test_write', () => {
  assert.ok(happyPathEngineActivityText(stage('stage_test_write_x', { title: '写测试' })).includes('RED'));
});
