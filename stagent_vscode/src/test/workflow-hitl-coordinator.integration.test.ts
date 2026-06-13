import './install-vscode-stub';
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { BackendMessage, WorkflowInstance } from '../WorkflowDefinition';
import { handleApprove, type HitlCoordinatorHost } from '../WorkflowHitlCoordinator';

function pausedInstance(): WorkflowInstance {
  return {
    definition: {
      id: 'wf',
      version: '2.0',
      meta: { title: 't', taskType: 'software', userInput: '', createdAt: '' },
      stages: [
        {
          id: 'stage_impl',
          title: '实现',
          tool: 'llm-text',
          toolConfig: { type: 'llm-text', systemPrompt: 'impl' },
          input: { sources: [], mergeStrategy: 'concat' },
          outputs: [{ key: 'text', format: 'text' }],
          pauseAfter: true,
        },
      ],
    },
    currentStageIndex: 0,
    stageRuntimes: [{ stageId: 'stage_impl', status: 'paused', outputs: { text: 'ok' }, retryCount: 0 }],
    status: 'running',
  };
}

describe('WorkflowHitlCoordinator integration', () => {
  it('handleApprove advances paused non-decision stage and schedules save', async () => {
    const messages: BackendMessage[] = [];
    let saved = false;
    let executed = false;
    const inst = pausedInstance();
    const host: HitlCoordinatorHost = {
      bindPanel: () => {},
      getInstance: () => inst,
      postMessage: (_p, msg) => messages.push(msg),
      logUserAction: () => {},
      markStageArtifactsApproved: () => {},
      scheduleSave: () => {
        saved = true;
      },
      persistMilestone: () => {},
      executeNextStage: async () => {
        executed = true;
      },
      ensureInstanceBound: () => true,
      rejectApproveDecision: () => {},
      isDecisionContentLintVscodeDefault: () => true,
      isContractCommitmentsEnabled: () => false,
      getMaxManualStageRetries: () => 3,
      getWorkspaceRootAbsolute: () => undefined,
      debugLog: () => {},
      warn: () => {},
      error: () => {},
      bumpCurrentStageIndex: () => {
        inst.currentStageIndex += 1;
      },
      setCurrentStageIndex: (i) => {
        inst.currentStageIndex = i;
      },
      setInstanceStatus: (s) => {
        inst.status = s;
      },
    };
    const panel = {} as never;
    await handleApprove(host, 'stage_impl', panel);
    assert.equal(inst.stageRuntimes[0].status, 'done');
    assert.ok(saved);
    assert.ok(executed);
    assert.ok(messages.some((m) => m.type === 'stageStatusUpdate'));
  });
});
