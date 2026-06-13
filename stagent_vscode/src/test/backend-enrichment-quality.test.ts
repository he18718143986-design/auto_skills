import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { enrichBackendMessageForWebview } from '../BackendMessageEnrichment';
import type { MessagingHost } from '../WorkflowEngineMessaging';
import type { WorkflowInstance } from '../WorkflowDefinition';
import { VERIFICATION_RUNS_OUTPUT_KEY } from '../WorkflowOutputKeys';

function completedHost(): MessagingHost {
  const instance: WorkflowInstance = {
    status: 'completed',
    currentStageIndex: 1,
    definition: {
      id: 'wf',
      version: '2.0',
      meta: { title: 't', taskType: 'software', userInput: 'u', createdAt: new Date().toISOString() },
      stages: [
        {
          id: 'stage_test_run_unit',
          title: 't',
          tool: 'code-runner',
          toolConfig: { type: 'code-runner', command: 'npm test', captureOutput: true },
          input: { sources: [], mergeStrategy: 'concat' },
          outputs: [{ key: 'main', format: 'text' }],
          pauseAfter: false,
        },
      ],
    },
    stageRuntimes: [
      {
        stageId: 'stage_test_run_unit',
        status: 'done',
        retryCount: 0,
        outputs: {
          [VERIFICATION_RUNS_OUTPUT_KEY]: [
            { attempt: 1, exitCode: 0 },
            { attempt: 2, exitCode: 0 },
          ],
        },
      },
    ],
  };
  return {
    getInstance: () => instance,
    getCurrentInstanceKey: () => 'sess-1',
    getGlobalStorageFsPath: () => '/tmp',
    getExperiencePersistedForKey: () => undefined,
    setExperiencePersistedForKey: () => {},
    warn: () => {},
    debugLog: () => {},
    logUserAction: () => {},
  };
}

test('enrichBackendMessageForWebview attaches qualityReport on workflowCompleted', () => {
  const host = completedHost();
  const enriched = enrichBackendMessageForWebview(host, { type: 'workflowCompleted' }, 1, 0);
  assert.equal(enriched.type, 'workflowCompleted');
  if (enriched.type !== 'workflowCompleted') {
    return;
  }
  assert.ok(enriched.qualityReport);
  assert.equal(enriched.qualityReport!.verificationRows.length, 1);
});
