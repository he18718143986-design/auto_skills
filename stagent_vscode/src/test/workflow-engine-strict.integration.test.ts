import * as assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import type { WorkflowDefinition } from '../WorkflowDefinition';
import hitlPauseFixture from './fixtures/engine/hitl-pause-single-stage.json';
import twoStageFixture from './fixtures/engine/two-stage-writing.json';
import {
  createEngineTestEnv,
  loadEngineFixtureJson,
  messagesOfType,
  wrapWorkflowJson,
} from './workflow-engine-test-harness';
import { TRACE_STAGE_WORKFLOW_GEN } from '../generation/GenerationTraceStageIds';

const TWO_STAGE_JSON = JSON.stringify(twoStageFixture);
const HITL_PAUSE_JSON = JSON.stringify(hitlPauseFixture);
const RUNTIME_RULE20_PASS_JSON = loadEngineFixtureJson(
  'scripts/fixtures/runtime-rule20/pass-minimal-todo-extension.json',
);

describe('WorkflowEngine strict gates integration', () => {
  const env = createEngineTestEnv({}, { gatesProfile: 'strict' });

  after(() => {
    env.cleanup();
  });

  it('generateWorkflow + startExecution with runtime Rule20 and static analysis enabled', async () => {
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

    await engine.generation.generateWorkflow('strict task', 'writing', panel, env.workspaceDir);

    const generated = messagesOfType(env.posted, 'workflowGenerated');
    assert.equal(generated.length, 1);
    assert.notEqual(generated[0].blocked, true);

    const wf = generated[0].workflow as WorkflowDefinition;
    env.posted.length = 0;
    await engine.execution.startExecution(panel, wf, generated[0].sessionId ?? generated[0].instanceKey);

    const completed = messagesOfType(env.posted, 'workflowCompleted');
    assert.equal(completed.length, 1);
    assert.equal(engine.instances.getCurrentStageInfo()?.status, 'completed');
  });

  it('accepts Rule20-compliant software workflow JSON under strict profile', async () => {
    env.posted.length = 0;
    env.setLlmHandler(async (traceStageId) => {
      if (traceStageId === TRACE_STAGE_WORKFLOW_GEN) {
        return wrapWorkflowJson(RUNTIME_RULE20_PASS_JSON);
      }
      return 'decision record body with enough sections for lint';
    });

    const engine = await env.createEngine();
    const panel = env.mockPanel();
    await engine.generation.generateWorkflow(
      'todo extension',
      'software',
      panel,
      env.workspaceDir,
    );

    const generated = messagesOfType(env.posted, 'workflowGenerated');
    assert.equal(generated.length, 1);
    assert.notEqual(generated[0].blocked, true);
    assert.ok((generated[0].workflow as WorkflowDefinition).stages.length >= 2);
  });

  it('pauseAfter stage: approve via hitl facade then workflowCompleted', async () => {
    env.posted.length = 0;
    env.setLlmHandler(async (traceStageId, prompt) => {
      if (traceStageId === TRACE_STAGE_WORKFLOW_GEN) {
        return wrapWorkflowJson(HITL_PAUSE_JSON);
      }
      if (prompt.includes('Write one line')) {
        return 'paused stage output';
      }
      return `mock:${traceStageId}`;
    });

    const engine = await env.createEngine();
    engine.execution.setPreferredModelFamily('test-model');
    const panel = env.mockPanel();

    await engine.generation.generateWorkflow('hitl pause', 'writing', panel, env.workspaceDir);
    const generated = messagesOfType(env.posted, 'workflowGenerated')[0]!;
    const wf = generated.workflow as WorkflowDefinition;

    env.posted.length = 0;
    await engine.execution.startExecution(panel, wf, generated.sessionId ?? generated.instanceKey);

    const progress = engine.instances.getCurrentStageInfo();
    assert.ok(progress);
    assert.equal(progress.stageId, 'stage_pause_impl');
    assert.equal(progress.status, 'paused');

    await engine.hitl.approve('stage_pause_impl', panel);

    await new Promise((r) => setTimeout(r, 100));
    const completed = messagesOfType(env.posted, 'workflowCompleted');
    assert.equal(completed.length, 1);
    assert.equal(engine.instances.getCurrentStageInfo()?.status, 'completed');
  });
});
