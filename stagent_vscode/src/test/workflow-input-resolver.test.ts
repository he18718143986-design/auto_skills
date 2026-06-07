import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import type { Stage, StageRuntime, WorkflowDefinition } from '../WorkflowDefinition';
import { contentOfSource, resolveStageInput } from '../WorkflowInputResolver';

function baseWorkflow(): WorkflowDefinition {
  return {
    id: 'wf_in',
    version: '2.0',
    meta: {
      title: 'in',
      taskType: 'software',
      userInput: 'hello user',
      createdAt: '2020-01-01T00:00:00.000Z',
    },
    stages: [
      {
        id: 'stage_a',
        title: 'a',
        tool: 'llm-text',
        toolConfig: { type: 'llm-text', systemPrompt: 's' },
        input: { sources: [{ type: 'user-input', label: 'x' }], mergeStrategy: 'concat' },
        outputs: [{ key: 'out', format: 'text' }],
        pauseAfter: false,
      },
      {
        id: 'stage_b',
        title: 'b',
        tool: 'llm-text',
        toolConfig: { type: 'llm-text', systemPrompt: 's' },
        input: {
          sources: [
            { type: 'user-input', label: 'req' },
            { type: 'constant', label: 'note', value: 'fixed' },
          ],
          mergeStrategy: 'concat',
        },
        outputs: [{ key: 'out', format: 'text' }],
        pauseAfter: false,
      },
    ],
  };
}

function runtimeFor(stageId: string, outputs: Record<string, unknown> = {}): StageRuntime {
  return {
    stageId,
    status: 'pending',
    outputs,
    retryCount: 0,
  };
}

const noopDeps = {
  readFileText: () => '',
  fileExists: () => false,
  safeJoinUnderWorkspaceRoot: (_r: string, rel: string) => rel,
  warn: () => {},
  debugLog: () => {},
  summarizeForInput: async (_s: string, _l: string, raw: string) => `SUM:${raw.slice(0, 20)}`,
  postMessage: () => {},
};

test('contentOfSource returns user-input and constant', async () => {
  const definition = baseWorkflow();
  const ctx = {
    definition,
    stageRuntimes: [runtimeFor('stage_a'), runtimeFor('stage_b')],
  };
  const stage = definition.stages[1];
  assert.equal(
    await contentOfSource(ctx, { type: 'user-input', label: 'req' }, stage, noopDeps),
    'hello user',
  );
  assert.equal(
    await contentOfSource(ctx, { type: 'constant', label: 'note', value: 'fixed' }, stage, noopDeps),
    'fixed',
  );
});

test('resolveStageInput concat merge joins non-stage-output sources', async () => {
  const definition = baseWorkflow();
  const stage = definition.stages[1];
  const runtime = runtimeFor('stage_b');
  const merged = await resolveStageInput(
    { definition, stageRuntimes: [runtimeFor('stage_a'), runtime] },
    stage,
    runtime,
    noopDeps,
  );
  assert.equal(merged, 'hello user\n\nfixed');
});

test('resolveStageInput template merge replaces placeholders', async () => {
  const definition = baseWorkflow();
  const stage: Stage = {
    ...definition.stages[1],
    input: {
      sources: [
        { type: 'user-input', label: 'req' },
        { type: 'constant', label: 'note', value: 'N' },
      ],
      mergeStrategy: 'template',
      mergeTemplate: 'REQ={{req}}\nNOTE={{note}}',
    },
  };
  const runtime = runtimeFor('stage_b');
  const merged = await resolveStageInput(
    { definition, stageRuntimes: [runtimeFor('stage_a'), runtime] },
    stage,
    runtime,
    noopDeps,
  );
  assert.equal(merged, 'REQ=hello user\nNOTE=N');
});

test('resolveStageInput degrades oversized stage-output via summarizeForInput', async () => {
  const definition = baseWorkflow();
  definition.stages.push({
    id: 'stage_c',
    title: 'c',
    tool: 'llm-text',
    toolConfig: { type: 'llm-text', systemPrompt: 's' },
    input: {
      sources: [
        {
          type: 'stage-output',
          label: 'big',
          stageId: 'stage_a',
          outputKey: 'out',
          contextMode: 'summary',
        },
      ],
      mergeStrategy: 'concat',
    },
    outputs: [{ key: 'out', format: 'text' }],
    pauseAfter: false,
  });
  const huge = 'word '.repeat(5000);
  const runtimes = [
    runtimeFor('stage_a', { out: huge }),
    runtimeFor('stage_b'),
    runtimeFor('stage_c'),
  ];
  const stage = definition.stages[2];
  const runtime = runtimes[2];
  let summarized = false;
  const merged = await resolveStageInput(
    { definition, stageRuntimes: runtimes },
    stage,
    runtime,
    {
      ...noopDeps,
      summarizeForInput: async () => {
        summarized = true;
        return 'short summary';
      },
    },
  );
  assert.equal(summarized, true);
  assert.equal(merged, 'short summary');
});
