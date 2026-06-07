import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Stage, WorkflowDefinition } from '../WorkflowDefinition';
import {
  findBestImplStageIndex,
  inferStackFromImplStage,
  inferStackFromTestRunStage,
} from '../TddStackMatch';

function makeStage(partial: Partial<Stage> & Pick<Stage, 'id'>): Stage {
  const { id, ...rest } = partial;
  return {
    id,
    title: id,
    tool: 'llm-text',
    toolConfig: { type: 'llm-text', systemPrompt: 'x' },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'out', format: 'text' }],
    pauseAfter: false,
    ...rest,
  };
}

describe('TddStackMatch stack inference', () => {
  it('inferStackFromTestRunStage parses cd server prefix', () => {
    const stage = makeStage({
      id: 'stage_test_run_x',
      tool: 'code-runner',
      toolConfig: {
        type: 'code-runner',
        command: 'cd server && npm test -- voice_integration',
        captureOutput: true,
      },
    });
    assert.equal(inferStackFromTestRunStage(stage), 'server');
  });

  it('inferStackFromTestRunStage returns null without cd', () => {
    const stage = makeStage({
      id: 'stage_test_run_x',
      tool: 'code-runner',
      toolConfig: { type: 'code-runner', command: 'npm test', captureOutput: true },
    });
    assert.equal(inferStackFromTestRunStage(stage), null);
  });

  it('inferStackFromImplStage uses writeOutputToFile top segment', () => {
    const stage = makeStage({
      id: 'stage_impl_x',
      toolConfig: {
        type: 'llm-text',
        systemPrompt: 'x',
        writeOutputToFile: 'mobile/lib/call_button.dart',
      },
    });
    assert.equal(inferStackFromImplStage(stage), 'mobile');
  });
});

describe('findBestImplStageIndex', () => {
  it('selects last same-stack impl in mixed slice', () => {
    const definition: WorkflowDefinition = {
      id: 'wf',
      version: '2.0',
      meta: { title: 't', taskType: 'software', userInput: 'u', createdAt: '' },
      stages: [
        makeStage({ id: 'stage_decide_voice', isDecisionStage: true }),
        makeStage({
          id: 'stage_impl_signaling',
          toolConfig: {
            type: 'llm-text',
            systemPrompt: 'x',
            writeOutputToFile: 'server/src/signaling.ts',
          },
        }),
        makeStage({
          id: 'stage_impl_session',
          toolConfig: {
            type: 'llm-text',
            systemPrompt: 'x',
            writeOutputToFile: 'server/src/call_session.ts',
          },
        }),
        makeStage({
          id: 'stage_impl_button',
          toolConfig: {
            type: 'llm-text',
            systemPrompt: 'x',
            writeOutputToFile: 'mobile/lib/call_button.dart',
          },
        }),
        makeStage({
          id: 'stage_test_run_voice',
          tool: 'code-runner',
          toolConfig: {
            type: 'code-runner',
            command: 'cd server && npm test -- voice_integration',
            captureOutput: true,
          },
        }),
      ],
    };
    const runIdx = definition.stages.length - 1;
    const testRun = definition.stages[runIdx]!;
    assert.equal(findBestImplStageIndex(definition, runIdx, testRun), 2);
    assert.equal(definition.stages[2]!.id, 'stage_impl_session');
  });
});
