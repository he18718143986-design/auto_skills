import test from 'node:test';
import assert from 'node:assert/strict';
import type { Stage } from '../WorkflowDefinition';
import {
  buildWorkflowDagGraphHtml,
  buildWorkflowDagGraphModel,
  shouldShowWorkflowDagGraph,
} from '../WorkflowDagGraph';

function st(partial: Partial<Stage> & Pick<Stage, 'id' | 'title'>): Stage {
  const { id, title, ...rest } = partial;
  return {
    id,
    title,
    tool: 'llm-text',
    toolConfig: { type: 'llm-text', systemPrompt: 'x' },
    input: partial.input ?? { sources: [{ type: 'user-input', label: 'u' }], mergeStrategy: 'concat' },
    outputs: [{ key: 'out', format: 'text' }],
    pauseAfter: false,
    ...rest,
  };
}

test('shouldShowWorkflowDagGraph when DAG enabled', () => {
  assert.equal(
    shouldShowWorkflowDagGraph({
      stages: [st({ id: 'a', title: 'a' })],
      globalConfig: { enableDagScheduler: true },
    }),
    true,
  );
});

test('buildWorkflowDagGraphModel: linear fallback without explicit deps', () => {
  const stages = [st({ id: 'a', title: 'a' }), st({ id: 'b', title: 'b' })];
  const model = buildWorkflowDagGraphModel(stages);
  assert.equal(model.mode, 'linear');
  assert.equal(model.waves.length, 2);
  assert.equal(model.edges.length, 1);
  assert.equal(model.edges[0].from, 'a');
  assert.equal(model.edges[0].to, 'b');
});

test('buildWorkflowDagGraphModel: dag waves from dependsOn', () => {
  const stages = [
    st({ id: 'a', title: 'A' }),
    st({ id: 'b', title: 'B', dependsOn: ['a'] }),
    st({ id: 'c', title: 'C', dependsOn: ['a'] }),
  ];
  const model = buildWorkflowDagGraphModel(stages);
  assert.equal(model.mode, 'dag');
  assert.equal(model.waves.length, 2);
  assert.equal(model.waves[0].map((n) => n.stageId).join(','), 'a');
  assert.deepEqual(model.waves[1].map((n) => n.stageId).sort(), ['b', 'c']);
});

test('buildWorkflowDagGraphHtml includes wave labels and edges', () => {
  const stages = [
    st({ id: 'a', title: 'A' }),
    st({ id: 'b', title: 'B', dependsOn: ['a'] }),
  ];
  const html = buildWorkflowDagGraphHtml(stages, { enableDagScheduler: true }, undefined, {
    onNodeClickStageId: true,
  });
  assert.match(html, /波次 1/);
  assert.match(html, /波次 2/);
  assert.match(html, /a → b/);
  assert.match(html, /dag-node-clickable/);
});

test('buildWorkflowDagGraphHtml empty when single linear stage without DAG', () => {
  const html = buildWorkflowDagGraphHtml([st({ id: 'only', title: 'Only' })], {});
  assert.equal(html, '');
});
