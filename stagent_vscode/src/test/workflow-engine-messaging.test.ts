import './install-vscode-stub';
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import type { Artifact } from '../ArtifactLifecycleManager';
import { emitStageArtifactHints, type MessagingHost } from '../WorkflowEngineMessaging';
import type { WorkflowInstance, Stage } from '../WorkflowDefinition';

function minimalInstanceWithArtifact(): WorkflowInstance {
  const stage: Stage = {
    id: 'stage_impl',
    title: 'Impl',
    tool: 'llm-text',
    toolConfig: {
      type: 'llm-text',
      systemPrompt: 'x',
      writeOutputToFile: 'src/App.tsx',
      writePathBase: 'workspace',
    },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'main', format: 'text' }],
    pauseAfter: true,
  };
  const registry: Artifact[] = [
    {
      stageId: 'stage_impl',
      outputKey: 'main',
      filePath: '/tmp/ws/src/App.tsx',
      state: 'persisted',
      checksum: 'abc',
      createdAt: '2026-01-01T00:00:00.000Z',
      existedBefore: true,
    },
  ];
  return {
    key: 'wf_test',
    status: 'running',
    definition: {
      id: 'wf_test',
      version: '2.0',
      meta: {
        title: 't',
        taskType: 'software',
        userInput: 'x',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      stages: [stage],
    },
    artifactRegistry: registry,
    stageRuntimes: [],
    currentStageIndex: 0,
  } as unknown as WorkflowInstance;
}

describe('emitStageArtifactHints', () => {
  const host: MessagingHost = {
    getInstance: () => undefined,
    getCurrentInstanceKey: () => 'inst-test',
    getGlobalStorageFsPath: () => '/tmp',
    getExperiencePersistedForKey: () => undefined,
    setExperiencePersistedForKey: () => {},
    warn: () => {},
    debugLog: () => {},
    logUserAction: () => {},
  };

  it('warns when webview postMessage rejects', async () => {
    const warnings: string[] = [];
    const posted: unknown[] = [];
    const panel = {
      webview: {
        postMessage: (msg: unknown) => {
          posted.push(msg);
          return Promise.reject(new Error('webview down'));
        },
      },
    } as never;
    emitStageArtifactHints(host, minimalInstanceWithArtifact(), panel, 'stage_impl', (m) =>
      warnings.push(m),
    );
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.ok(warnings.some((w) => w.includes('webview_post_message_failed')));
    const msg = posted[0] as { instanceKey?: string };
    assert.equal(msg.instanceKey, 'inst-test');
  });
});
