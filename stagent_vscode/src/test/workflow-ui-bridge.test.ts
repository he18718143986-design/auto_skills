import './install-vscode-stub';
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { BackendMessage } from '../WorkflowDefinition';
import { WorkflowUiBridge } from '../WorkflowUiBridge';
import { GENERATION_OPERATION_WORKFLOW } from '../generation/GenerationOperationIds';
import type { MessagingHost } from '../WorkflowEngineMessaging';

function mockMessagingHost(): MessagingHost & { actions: string[]; warnings: string[] } {
  const actions: string[] = [];
  const warnings: string[] = [];
  return {
    actions,
    warnings,
    getInstance: () => undefined,
    getCurrentInstanceKey: () => undefined,
    getGlobalStorageFsPath: () => '/tmp/global',
    getExperiencePersistedForKey: () => undefined,
    setExperiencePersistedForKey: () => {},
    warn: (m) => {
      warnings.push(m);
    },
    debugLog: () => {},
    logUserAction: (kind) => {
      actions.push(`user_action:${kind}`);
    },
  };
}

async function flushBridgeDelivery(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe('WorkflowUiBridge integration', () => {
  it('binds panel and delivers postMessage to webview with side effects', async () => {
    const posted: BackendMessage[] = [];
    const host = mockMessagingHost();
    const bridge = new WorkflowUiBridge({
      messagingHost: () => host,
      getFeedbackLastAsked: () => undefined,
      setFeedbackLastAsked: async () => {},
      getCharterFeedbackLastAsked: () => undefined,
      setCharterFeedbackLastAsked: async () => {},
    });
    const panel = {
      webview: {
        postMessage: (msg: BackendMessage) => {
          posted.push(msg);
        },
      },
    } as never;

    bridge.bindPanel(panel);
    bridge.postMessage(undefined, { type: 'clarifyQuestions', questions: [] });
    await flushBridgeDelivery();

    assert.equal(posted.length, 1);
    assert.equal(posted[0].type, 'clarifyQuestions');
    assert.equal(typeof posted[0].seq, 'number');
    assert.equal(posted[0].seq, 1);
    assert.equal(posted[0].uiEpoch, 0);
  });

  it('delivers postMessage in call order when webview postMessage is async', async () => {
    const posted: BackendMessage[] = [];
    const order: string[] = [];
    const bridge = new WorkflowUiBridge({
      messagingHost: () => mockMessagingHost(),
      getFeedbackLastAsked: () => undefined,
      setFeedbackLastAsked: async () => {},
      getCharterFeedbackLastAsked: () => undefined,
      setCharterFeedbackLastAsked: async () => {},
    });
    const panel = {
      webview: {
        postMessage: (msg: BackendMessage) => {
          order.push(`start:${msg.type}`);
          return new Promise<void>((resolve) => {
            setTimeout(() => {
              posted.push(msg);
              order.push(`done:${msg.type}`);
              resolve();
            }, 5);
          });
        },
      },
    } as never;

    bridge.bindPanel(panel);
    bridge.postMessage(panel, { type: 'clarifyQuestions', questions: [] });
    bridge.postMessage(panel, { type: 'generationCancelled' });

    await new Promise<void>((resolve) => setTimeout(resolve, 30));
    assert.equal(posted.length, 2);
    assert.equal(posted[0].seq, 1);
    assert.equal(posted[1].seq, 2);
    assert.deepEqual(order, ['start:clarifyQuestions', 'done:clarifyQuestions', 'start:generationCancelled', 'done:generationCancelled']);
  });

  it('beginUiResync resets delivery chain so recovery burst is not blocked by backlog', async () => {
    const posted: BackendMessage[] = [];
    let resolveFirst: (() => void) | undefined;
    const firstGate = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    const bridge = new WorkflowUiBridge({
      messagingHost: () => mockMessagingHost(),
      getFeedbackLastAsked: () => undefined,
      setFeedbackLastAsked: async () => {},
      getCharterFeedbackLastAsked: () => undefined,
      setCharterFeedbackLastAsked: async () => {},
    });
    const panel = {
      webview: {
        postMessage: (msg: BackendMessage) => {
          if (msg.type === 'clarifyQuestions') {
            return firstGate.then(() => {
              posted.push(msg);
            });
          }
          posted.push(msg);
          return Promise.resolve();
        },
      },
    } as never;

    bridge.bindPanel(panel);
    bridge.postMessage(panel, { type: 'clarifyQuestions', questions: [] });
    bridge.postMessage(panel, { type: 'generationCancelled' });

    bridge.beginUiResync();
    bridge.postMessage(panel, { type: 'instanceResumed', instanceKey: 'k', workflow: {} as never, instanceStatus: 'paused' });
    await flushBridgeDelivery();

    assert.equal(posted[0]?.type, 'instanceResumed');
    assert.equal(bridge.getUiEpoch(), 1);

    resolveFirst!();
    await flushBridgeDelivery();
  });

  it('beginUiResync increments uiEpoch on subsequent messages', async () => {
    const posted: BackendMessage[] = [];
    const bridge = new WorkflowUiBridge({
      messagingHost: () => mockMessagingHost(),
      getFeedbackLastAsked: () => undefined,
      setFeedbackLastAsked: async () => {},
      getCharterFeedbackLastAsked: () => undefined,
      setCharterFeedbackLastAsked: async () => {},
    });
    const panel = {
      webview: { postMessage: (msg: BackendMessage) => posted.push(msg) },
    } as never;

    bridge.bindPanel(panel);
    bridge.beginUiResync();
    bridge.postMessage(panel, { type: 'generationCancelled' });
    await flushBridgeDelivery();

    assert.equal(posted[0].uiEpoch, 1);
  });

  it('injects instanceKey from messaging host when bound', async () => {
    const posted: BackendMessage[] = [];
    const host = mockMessagingHost();
    host.getCurrentInstanceKey = () => 'inst-bound-1';
    const bridge = new WorkflowUiBridge({
      messagingHost: () => host,
      getFeedbackLastAsked: () => undefined,
      setFeedbackLastAsked: async () => {},
      getCharterFeedbackLastAsked: () => undefined,
      setCharterFeedbackLastAsked: async () => {},
    });
    const panel = {
      webview: { postMessage: (msg: BackendMessage) => posted.push(msg) },
    } as never;

    bridge.bindPanel(panel);
    bridge.postMessage(panel, { type: 'stageStatusUpdate', stageId: 's1', status: 'running' });
    await flushBridgeDelivery();

    assert.equal(posted.length, 1);
    assert.equal(posted[0].instanceKey, 'inst-bound-1');
    assert.equal(posted[0].sessionId, 'inst-bound-1');
  });

  it('postGenerationProgress wraps generationProgress message', async () => {
    const posted: BackendMessage[] = [];
    const bridge = new WorkflowUiBridge({
      messagingHost: () => mockMessagingHost(),
      getFeedbackLastAsked: () => undefined,
      setFeedbackLastAsked: async () => {},
      getCharterFeedbackLastAsked: () => undefined,
      setCharterFeedbackLastAsked: async () => {},
    });
    const panel = {
      webview: { postMessage: (msg: BackendMessage) => posted.push(msg) },
    } as never;

    bridge.postGenerationProgress(panel, GENERATION_OPERATION_WORKFLOW, 'llm', '等待模型…', 'detail');
    await flushBridgeDelivery();

    assert.equal(posted.length, 1);
    if (posted[0].type === 'generationProgress') {
      assert.equal(posted[0].operation, GENERATION_OPERATION_WORKFLOW);
      assert.equal(posted[0].phase, 'llm');
    } else {
      assert.fail('expected generationProgress');
    }
  });

  it('warns when webview postMessage rejects', async () => {
    const host = mockMessagingHost();
    const bridge = new WorkflowUiBridge({
      messagingHost: () => host,
      getFeedbackLastAsked: () => undefined,
      setFeedbackLastAsked: async () => {},
      getCharterFeedbackLastAsked: () => undefined,
      setCharterFeedbackLastAsked: async () => {},
    });
    const panel = {
      webview: {
        postMessage: () => Promise.reject(new Error('webview down')),
      },
    } as never;
    bridge.bindPanel(panel);
    bridge.postMessage(panel, { type: 'clarifyQuestions', questions: [] });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.ok(host.warnings.some((w) => w.includes('webview_post_message_failed')));
  });

  it('records stageError side effect via messaging host', async () => {
    const host = mockMessagingHost();
    const bridge = new WorkflowUiBridge({
      messagingHost: () => host,
      getFeedbackLastAsked: () => undefined,
      setFeedbackLastAsked: async () => {},
      getCharterFeedbackLastAsked: () => undefined,
      setCharterFeedbackLastAsked: async () => {},
    });
    const panel = { webview: { postMessage: () => {} } } as never;
    bridge.bindPanel(panel);
    bridge.postMessage(panel, {
      type: 'stageError',
      stageId: 'stage_x',
      error: 'boom',
      errorType: 'llm-invalid-output',
    });
    await flushBridgeDelivery();
    assert.ok(host.actions.includes('user_action:stage_error'));
  });
});
