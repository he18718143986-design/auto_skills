import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Stage, StageRuntime, WorkflowDefinition, WorkflowInstance } from '../WorkflowDefinition';
import { findLastImplStageIndex } from '../TddSliceScope';
import {
  deriveUpstreamFixEligibility,
  isUpstreamFixEligible,
  resolveUpstreamImplStageId,
} from '../retry/UpstreamFix';
import {
  collectUpstreamFixResets,
  copyFailureSnapshotForUpstreamFix,
} from '../retry/UpstreamFixResets';
import { buildAutoRetryComment } from '../retry/FailureSnapshot';

function makeStage(partial: Partial<Stage> & Pick<Stage, 'id' | 'title'>): Stage {
  const { id, title, ...rest } = partial;
  return {
    id,
    title,
    tool: 'llm-text',
    toolConfig: { type: 'llm-text', systemPrompt: 'x' },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'out', format: 'text' }],
    pauseAfter: false,
    ...rest,
  };
}

function integrationSliceDefinition(): WorkflowDefinition {
  return {
    id: 'wf',
    version: '2.0',
    meta: { title: 't', taskType: 'software', userInput: 'u', createdAt: '' },
    stages: [
      makeStage({ id: 'stage_decide_chat', title: 'd', isDecisionStage: true }),
      makeStage({ id: 'stage_impl_models', title: 'models' }),
      makeStage({ id: 'stage_impl_routes', title: 'routes' }),
      makeStage({ id: 'stage_test_write_chat_integration', title: 'write' }),
      makeStage({
        id: 'stage_test_run_chat_integration',
        title: 'run',
        tool: 'code-runner',
        toolConfig: { type: 'code-runner', command: 'npm test', captureOutput: true },
      }),
    ],
  };
}

describe('findLastImplStageIndex', () => {
  it('returns last impl before anchor within same decide boundary', () => {
    const def = integrationSliceDefinition();
    const runIdx = def.stages.findIndex((s) => s.id === 'stage_test_run_chat_integration');
    assert.equal(findLastImplStageIndex(def.stages, runIdx), 2);
  });

  it('returns -1 when slice has no impl', () => {
    const def: WorkflowDefinition = {
      id: 'wf',
      version: '2.0',
      meta: { title: 't', taskType: 'software', userInput: 'u', createdAt: '' },
      stages: [
        makeStage({ id: 'stage_test_run_x', title: 'run', tool: 'code-runner', toolConfig: { type: 'code-runner', command: 't', captureOutput: true } }),
      ],
    };
    assert.equal(findLastImplStageIndex(def.stages, 0), -1);
  });
});

describe('upstream fix eligibility', () => {
  it('allows code category test_run exitCode=1', () => {
    assert.equal(
      isUpstreamFixEligible({
        stageId: 'stage_test_run_chat_integration',
        userCategory: 'code',
        exitCode: 1,
      }),
      true,
    );
  });

  it('rejects weakenRetry / exitCode 127', () => {
    assert.equal(
      isUpstreamFixEligible({
        stageId: 'stage_test_run_chat_ui',
        userCategory: 'environment',
        weakenRetry: true,
        exitCode: 127,
      }),
      false,
    );
  });

  it('deriveUpstreamFixEligibility reads snapshot exitCode', () => {
    const rt: StageRuntime = {
      stageId: 'stage_test_run_x',
      status: 'error',
      outputs: {},
      retryCount: 0,
      lastFailureSnapshot: {
        capturedAt: 'x',
        errorType: 'tool-execution-failed',
        exitCode: 1,
        stderr: 'fail',
        outputs: {},
      },
    };
    const e = deriveUpstreamFixEligibility('stage_test_run_x', rt);
    assert.equal(e.userCategory, 'code');
    assert.equal(isUpstreamFixEligible(e), true);
  });
});

describe('resolveUpstreamImplStageId', () => {
  it('maps failed test_run to last impl in slice', () => {
    const definition = integrationSliceDefinition();
    const instance: WorkflowInstance = {
      definition,
      currentStageIndex: 4,
      status: 'failed',
      stageRuntimes: definition.stages.map((s) => ({
        stageId: s.id,
        status: s.id === 'stage_test_run_chat_integration' ? 'error' : 'done',
        outputs: {},
        retryCount: 0,
      })),
    };
    assert.equal(
      resolveUpstreamImplStageId(instance, 'stage_test_run_chat_integration'),
      'stage_impl_routes',
    );
  });

  it('prefers same-stack impl over positional last in mixed server/mobile slice', () => {
    const definition: WorkflowDefinition = {
      id: 'wf',
      version: '2.0',
      meta: { title: 't', taskType: 'software', userInput: 'u', createdAt: '' },
      stages: [
        makeStage({ id: 'stage_decide_voice', title: 'd', isDecisionStage: true }),
        makeStage({
          id: 'stage_impl_webrtc_signaling',
          title: 'signaling',
          toolConfig: {
            type: 'llm-text',
            systemPrompt: 'x',
            writeOutputToFile: 'server/src/signaling.ts',
          },
        }),
        makeStage({
          id: 'stage_impl_call_session',
          title: 'session',
          toolConfig: {
            type: 'llm-text',
            systemPrompt: 'x',
            writeOutputToFile: 'server/src/call_session.ts',
          },
        }),
        makeStage({
          id: 'stage_impl_call_ui_call_button',
          title: 'button',
          toolConfig: {
            type: 'llm-text',
            systemPrompt: 'x',
            writeOutputToFile: 'mobile/lib/call_button.dart',
          },
        }),
        makeStage({ id: 'stage_test_write_call_ui', title: 'write ui test' }),
        makeStage({
          id: 'stage_test_run_voice_integration',
          title: 'run voice',
          tool: 'code-runner',
          toolConfig: {
            type: 'code-runner',
            command: 'cd server && npm test -- voice_integration',
            captureOutput: true,
          },
        }),
      ],
    };
    const instance: WorkflowInstance = {
      definition,
      currentStageIndex: 5,
      status: 'failed',
      stageRuntimes: definition.stages.map((s) => ({
        stageId: s.id,
        status: s.id === 'stage_test_run_voice_integration' ? 'error' : 'done',
        outputs: {},
        retryCount: 0,
      })),
    };
    assert.equal(
      resolveUpstreamImplStageId(instance, 'stage_test_run_voice_integration'),
      'stage_impl_call_session',
    );
  });

  it('falls back to last impl when test_run stack cannot be inferred', () => {
    const definition: WorkflowDefinition = {
      id: 'wf',
      version: '2.0',
      meta: { title: 't', taskType: 'software', userInput: 'u', createdAt: '' },
      stages: [
        makeStage({ id: 'stage_decide_voice', title: 'd', isDecisionStage: true }),
        makeStage({
          id: 'stage_impl_server',
          title: 'server',
          toolConfig: {
            type: 'llm-text',
            systemPrompt: 'x',
            writeOutputToFile: 'server/src/a.ts',
          },
        }),
        makeStage({
          id: 'stage_impl_mobile',
          title: 'mobile',
          toolConfig: {
            type: 'llm-text',
            systemPrompt: 'x',
            writeOutputToFile: 'mobile/lib/a.dart',
          },
        }),
        makeStage({
          id: 'stage_test_run_voice_integration',
          title: 'run',
          tool: 'code-runner',
          toolConfig: { type: 'code-runner', command: 'npm test', captureOutput: true },
        }),
      ],
    };
    const instance: WorkflowInstance = {
      definition,
      currentStageIndex: 3,
      status: 'failed',
      stageRuntimes: definition.stages.map((s) => ({
        stageId: s.id,
        status: s.id === 'stage_test_run_voice_integration' ? 'error' : 'done',
        outputs: {},
        retryCount: 0,
      })),
    };
    assert.equal(
      resolveUpstreamImplStageId(instance, 'stage_test_run_voice_integration'),
      'stage_impl_mobile',
    );
  });
});

describe('UpstreamFixResets', () => {
  it('collectUpstreamFixResets only resets failed test_run', () => {
    const definition = integrationSliceDefinition();
    const instance: WorkflowInstance = {
      definition,
      currentStageIndex: 4,
      status: 'failed',
      stageRuntimes: definition.stages.map((s) => ({
        stageId: s.id,
        status: s.id === 'stage_test_run_chat_integration' ? 'error' : 'done',
        outputs: s.id === 'stage_test_write_chat_integration' ? { out: 'tests' } : {},
        retryCount: 0,
        lastFailureSnapshot:
          s.id === 'stage_test_run_chat_integration'
            ? { capturedAt: 'x', stderr: 'ERR', outputs: {} }
            : undefined,
      })),
    };
    const writeIdx = definition.stages.findIndex((s) => s.id === 'stage_test_write_chat_integration');
    const runIdx = definition.stages.findIndex((s) => s.id === 'stage_test_run_chat_integration');
    const out = collectUpstreamFixResets(definition, instance, 'stage_test_run_chat_integration');
    assert.deepEqual(out.resetStageIds, ['stage_test_run_chat_integration']);
    assert.equal(instance.stageRuntimes[writeIdx]!.status, 'done');
    assert.deepEqual(instance.stageRuntimes[writeIdx]!.outputs, { out: 'tests' });
    assert.equal(instance.stageRuntimes[runIdx]!.status, 'pending');
    assert.equal(instance.stageRuntimes[runIdx]!.lastFailureSnapshot, undefined);
  });

  it('copyFailureSnapshotForUpstreamFix preserves comment source on impl', () => {
    const source: StageRuntime = {
      stageId: 'stage_test_run_x',
      status: 'error',
      outputs: {},
      retryCount: 0,
      lastFailureSnapshot: {
        capturedAt: 'x',
        stderr: 'COPY_ME',
        errorType: 'tool-execution-failed',
        exitCode: 1,
        outputs: {},
      },
    };
    const target: StageRuntime = {
      stageId: 'stage_impl_x',
      status: 'done',
      outputs: {},
      retryCount: 0,
    };
    assert.equal(copyFailureSnapshotForUpstreamFix(source, target), true);
    assert.match(buildAutoRetryComment(target.lastFailureSnapshot!, 'stage_impl_x'), /COPY_ME/);
  });
});
