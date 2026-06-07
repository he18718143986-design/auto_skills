import * as assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import type { WorkflowDefinition } from '../WorkflowDefinition';
import blockedFixture from './fixtures/engine/blocked-python-runner.json';
import twoStageFixture from './fixtures/engine/two-stage-writing.json';
import {
  createEngineTestEnv,
  messagesOfType,
  wrapWorkflowJson,
} from './workflow-engine-test-harness';
import { TRACE_STAGE_WORKFLOW_GEN } from '../generation/GenerationTraceStageIds';

const TWO_STAGE_JSON = JSON.stringify(twoStageFixture);
const BLOCKED_JSON = JSON.stringify(blockedFixture);

describe('WorkflowEngine integration', () => {
  const env = createEngineTestEnv();

  after(() => {
    env.cleanup();
  });

  it('generateWorkflow → startExecution → 2 stages → workflowCompleted', async () => {
    env.posted.length = 0;
    env.setLlmHandler(async (traceStageId, prompt) => {
      if (traceStageId === TRACE_STAGE_WORKFLOW_GEN) {
        return wrapWorkflowJson(TWO_STAGE_JSON);
      }
      if (prompt.includes('Write a short outline')) {
        return 'outline content';
      }
      if (prompt.includes('Write a short draft')) {
        return 'draft content';
      }
      return `mock:${traceStageId}`;
    });

    const engine = await env.createEngine();
    engine.execution.setPreferredModelFamily('test-model');
    const panel = env.mockPanel();

    await engine.generation.generateWorkflow('integration task', 'writing', panel, env.workspaceDir);

    const generated = messagesOfType(env.posted, 'workflowGenerated');
    assert.equal(generated.length, 1, '应推送 workflowGenerated');
    assert.equal(generated[0].blocked, undefined);
    assert.equal(generated[0].sessionId, generated[0].instanceKey);

    const wf = generated[0].workflow as WorkflowDefinition;
    assert.equal(wf.stages.length, 2);

    env.posted.length = 0;
    await engine.execution.startExecution(panel, wf, generated[0].sessionId ?? generated[0].instanceKey);

    const synced = env.posted.filter(
      (m) => m.type === 'sessionSynced' || m.type === 'instanceKeySynced',
    );
    assert.ok(synced.length >= 1, 'startExecution 应同步 session');

    const completed = messagesOfType(env.posted, 'workflowCompleted');
    assert.equal(completed.length, 1, '两阶段执行后应 workflowCompleted');
    assert.equal(engine.instances.getCurrentStageInfo()?.status, 'completed');
    assert.equal(engine.instances.getCurrentStageInfo()?.completedStages, 2);
  });

  it('blocked 确认页：validation 错误 + 可渲染 workflow → workflowGenerated.blocked', async () => {
    env.posted.length = 0;
    env.setLlmHandler(async (traceStageId) => {
      if (traceStageId === TRACE_STAGE_WORKFLOW_GEN) {
        return wrapWorkflowJson(BLOCKED_JSON);
      }
      return 'unused';
    });

    const engine = await env.createEngine();
    engine.execution.setPreferredModelFamily('test-model');
    const panel = env.mockPanel();

    await engine.generation.generateWorkflow('blocked task', 'prototype', panel, env.workspaceDir);

    const generated = messagesOfType(env.posted, 'workflowGenerated');
    assert.equal(generated.length, 1);
    assert.equal(generated[0].blocked, true);
    assert.ok(Array.isArray(generated[0].blockReasons));
    assert.ok((generated[0].blockReasons?.length ?? 0) > 0);
    assert.ok(
      generated[0].blockReasons!.some((r) => r.includes('python-script-not-in-artifacts')),
      '应包含 python-script-not-in-artifacts 拦截原因',
    );

    const failed = messagesOfType(env.posted, 'workflowFailed');
    assert.equal(failed.length, 0, '可渲染 blocked 计划不应 workflowFailed');
  });

  it('generationSeq 作废：后发请求完成后，先发请求不应再推送 workflowGenerated', async () => {
    env.posted.length = 0;
    let genCalls = 0;
    let releaseFirst: (() => void) | undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    env.setLlmHandler(async (traceStageId) => {
      if (traceStageId !== TRACE_STAGE_WORKFLOW_GEN) {
        return 'x';
      }
      genCalls += 1;
      if (genCalls === 1) {
        await firstGate;
        return wrapWorkflowJson(TWO_STAGE_JSON);
      }
      return wrapWorkflowJson(TWO_STAGE_JSON);
    });

    const engine = await env.createEngine();
    engine.execution.setPreferredModelFamily('test-model');
    const panel = env.mockPanel();

    const first = engine.generation.generateWorkflow('first', 'writing', panel, env.workspaceDir);
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(genCalls, 1, '第一次生成应已进入 LLM 调用');

    await engine.generation.generateWorkflow('second', 'writing', panel, env.workspaceDir);
    const afterSecond = messagesOfType(env.posted, 'workflowGenerated').length;
    assert.equal(afterSecond, 1, '第二次生成应产出 workflowGenerated');

    releaseFirst!();
    await first;

    const afterFirstSettled = messagesOfType(env.posted, 'workflowGenerated').length;
    assert.equal(afterFirstSettled, 1, '被 supersede 的第一次生成不应追加 workflowGenerated');

    const failed = messagesOfType(env.posted, 'workflowFailed');
    assert.equal(failed.length, 0, 'supersede 静默退出，不应 workflowFailed');
  });
});
