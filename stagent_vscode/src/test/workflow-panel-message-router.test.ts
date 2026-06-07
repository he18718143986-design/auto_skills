import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FrontendMessage } from '../WorkflowDefinition';
import { routeWorkflowPanelMessage } from '../WorkflowPanelMessageRouter';

test('routeWorkflowPanelMessage warns on unknown frontend type', async () => {
  const warnings: string[] = [];
  const posted: unknown[] = [];
  const engine = {} as never;
  const panel = {
    webview: {
      postMessage: (msg: unknown) => {
        posted.push(msg);
      },
    },
  } as never;

  const msg = { type: 'notARealFrontendType' } as unknown as FrontendMessage;
  await routeWorkflowPanelMessage(engine, panel, msg, (m) => warnings.push(m));

  assert.equal(warnings.length, 1);
  assert.match(warnings[0]!, /panel_message_unhandled type=notARealFrontendType/);
  assert.equal(posted.length, 1);
  assert.equal((posted[0] as { type: string }).type, 'actionHint');
});
