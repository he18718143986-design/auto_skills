import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { FrontendMessage } from '../WorkflowDefinition';
import type { WorkflowEngine } from '../WorkflowEngine';
import { buildPanelHandlerMap } from '../panel-handlers/registry';
import { routeWorkflowPanelMessage } from '../WorkflowPanelMessageRouter';

interface RecordedCall {
  method: string;
  args: unknown[];
}

function makeEngine(): {
  engine: WorkflowEngine;
  calls: RecordedCall[];
  enginePosted: Array<Record<string, unknown>>;
} {
  const calls: RecordedCall[] = [];
  const enginePosted: Array<Record<string, unknown>> = [];
  const rec =
    (method: string) =>
    (...args: unknown[]): void => {
      calls.push({ method, args });
    };
  const engine = {
    postMessage: (_panel: unknown, msg: Record<string, unknown>): void => {
      enginePosted.push(msg);
    },
    generation: {
      polishUserTask: rec('polishUserTask'),
      generateClarifyQuestions: rec('generateClarifyQuestions'),
      generateWorkflow: rec('generateWorkflow'),
    },
    execution: {
      startExecution: rec('startExecution'),
    },
    hitl: {
      approve: rec('approve'),
      approveDecision: rec('approveDecision'),
      answerQuestionsBefore: rec('answerQuestionsBefore'),
      answerQuestions: rec('answerQuestions'),
      retry: rec('retry'),
      editOutput: rec('editOutput'),
    },
    artifacts: {
      copyRecentDebugLog: rec('copyRecentDebugLog'),
      copyRecentSessionLog: rec('copyRecentSessionLog'),
      openArtifactFile: rec('openArtifactFile'),
      openArtifactDiff: rec('openArtifactDiff'),
    },
    instances: {
      resyncPanelUi: rec('resyncPanelUi'),
    },
  };
  return { engine: engine as unknown as WorkflowEngine, calls, enginePosted };
}

function makePanel(): { panel: vscode.WebviewPanel; posted: Array<Record<string, unknown>> } {
  const posted: Array<Record<string, unknown>> = [];
  const panel = {
    webview: {
      postMessage: async (m: Record<string, unknown>): Promise<boolean> => {
        posted.push(m);
        return true;
      },
    },
  };
  return { panel: panel as unknown as vscode.WebviewPanel, posted };
}

/**
 * 就地改写共享 vscode 桩 window 的方法（覆盖 showOpenDialog/showErrorMessage），
 * 执行后还原。处理器经 __importStar live getter 共享同一 window 引用，故改写可见。
 */
async function withVscodeWindow<T>(
  overrides: { openDialogResult?: Array<{ fsPath: string }> },
  fn: (state: { errors: string[] }) => Promise<T> | T,
): Promise<T> {
  const win = (vscode as unknown as { window: Record<string, unknown> }).window;
  const prevOpen = win.showOpenDialog;
  const prevError = win.showErrorMessage;
  const errors: string[] = [];
  win.showOpenDialog = async () => overrides.openDialogResult;
  win.showErrorMessage = async (m: string) => {
    errors.push(m);
    return undefined;
  };
  try {
    return await fn({ errors });
  } finally {
    win.showOpenDialog = prevOpen;
    win.showErrorMessage = prevError;
  }
}

function route(
  engine: WorkflowEngine,
  panel: vscode.WebviewPanel,
  msg: Record<string, unknown>,
  warn: (m: string) => void = () => {},
): Promise<void> {
  return routeWorkflowPanelMessage(engine, panel, msg as unknown as FrontendMessage, warn);
}

test('router warns and posts actionHint for unhandled message types', async () => {
  const { engine, calls } = makeEngine();
  const { panel, posted } = makePanel();
  const warnings: string[] = [];
  await route(engine, panel, { type: '__nope__' }, (m) => warnings.push(m));
  assert.equal(calls.length, 0);
  assert.deepEqual(warnings, ['panel_message_unhandled type=__nope__']);
  assert.equal(posted.length, 1);
  assert.equal(posted[0].type, 'actionHint');
});

test('webviewReady resyncs active instance panel UI', async () => {
  const { engine, calls } = makeEngine();
  const { panel, posted } = makePanel();
  await route(engine, panel, { type: 'webviewReady' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'resyncPanelUi');
  assert.equal(calls[0].args[0], panel);
  assert.equal(posted.length, 0);
});

test('pickTaskWorkspaceFolder posts picked path when a folder is selected', async () => {
  const { engine } = makeEngine();
  const { panel, posted } = makePanel();
  await withVscodeWindow({ openDialogResult: [{ fsPath: '/picked/dir' }] }, () =>
    route(engine, panel, { type: 'pickTaskWorkspaceFolder' }),
  );
  assert.deepEqual(posted, [{ type: 'taskWorkspacePathPicked', path: '/picked/dir' }]);
});

test('pickTaskWorkspaceFolder posts nothing when dialog is cancelled', async () => {
  const { engine } = makeEngine();
  const { panel, posted } = makePanel();
  await withVscodeWindow({ openDialogResult: undefined }, () =>
    route(engine, panel, { type: 'pickTaskWorkspaceFolder' }),
  );
  assert.equal(posted.length, 0);
});

test('polishUserTask forwards draft, taskType and trimmed workspace path', async () => {
  const { engine, calls } = makeEngine();
  const { panel } = makePanel();
  await route(engine, panel, {
    type: 'polishUserTask',
    draft: 'do x',
    taskType: 'software',
    taskWorkspacePath: '  /ws  ',
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'polishUserTask');
  assert.deepEqual(calls[0].args.slice(0, 2), ['do x', 'software']);
  assert.equal(calls[0].args[3], '/ws');
});

test('polishUserTask passes undefined workspace path when blank', async () => {
  const { engine, calls } = makeEngine();
  const { panel } = makePanel();
  await route(engine, panel, { type: 'polishUserTask', draft: 'd', taskWorkspacePath: '   ' });
  assert.equal(calls[0].args[3], undefined);
});

test('polishUserTask defaults taskType and omits non-string workspace path', async () => {
  const { engine, calls } = makeEngine();
  const { panel } = makePanel();
  await route(engine, panel, { type: 'polishUserTask', draft: 'd' });
  assert.equal(calls[0].method, 'polishUserTask');
  assert.equal(calls[0].args[1], 'auto');
  assert.equal(calls[0].args[3], undefined);
});

test('clarifyStart rejects when workspace path is missing', async () => {
  const { engine, calls, enginePosted } = makeEngine();
  const { panel } = makePanel();
  await withVscodeWindow({}, ({ errors }) =>
    route(engine, panel, { type: 'clarifyStart', userInput: 'u' }).then(() => {
      assert.equal(calls.length, 0);
      assert.equal(errors.length, 1);
      assert.equal(enginePosted.length, 1, 'should post workflowFailed so the webview clears busy');
      assert.equal(enginePosted[0].type, 'workflowFailed');
    }),
  );
});

test('clarifyStart forwards to generation when workspace path is present', async () => {
  const { engine, calls } = makeEngine();
  const { panel } = makePanel();
  await route(engine, panel, {
    type: 'clarifyStart',
    userInput: 'u',
    taskType: 'software',
    taskWorkspacePath: ' /ws ',
  });
  assert.equal(calls[0].method, 'generateClarifyQuestions');
  assert.deepEqual(calls[0].args.slice(0, 3), ['u', 'software', '/ws']);
});

test('clarifyStart defaults taskType when absent', async () => {
  const { engine, calls } = makeEngine();
  const { panel } = makePanel();
  await route(engine, panel, { type: 'clarifyStart', userInput: 'u', taskWorkspacePath: '/ws' });
  assert.equal(calls[0].method, 'generateClarifyQuestions');
  assert.equal(calls[0].args[1], 'auto');
});

test('generateWorkflow defaults taskType when absent', async () => {
  const { engine, calls } = makeEngine();
  const { panel } = makePanel();
  await route(engine, panel, {
    type: 'generateWorkflow',
    userInput: 'u',
    taskWorkspacePath: '/ws',
  });
  assert.equal(calls[0].method, 'generateWorkflow');
  assert.equal(calls[0].args[1], 'auto');
});

test('generateWorkflow rejects when workspace path is missing', async () => {
  const { engine, calls, enginePosted } = makeEngine();
  const { panel } = makePanel();
  await withVscodeWindow({}, ({ errors }) =>
    route(engine, panel, { type: 'generateWorkflow', userInput: 'u' }).then(() => {
      assert.equal(calls.length, 0);
      assert.equal(errors.length, 1);
      assert.equal(enginePosted.length, 1, 'should post workflowFailed so the webview clears busy');
      assert.equal(enginePosted[0].type, 'workflowFailed');
    }),
  );
});

test('clarifyStart rejects a whitespace-only workspace path', async () => {
  const { engine, calls, enginePosted } = makeEngine();
  const { panel } = makePanel();
  await withVscodeWindow({}, ({ errors }) =>
    route(engine, panel, { type: 'clarifyStart', userInput: 'u', taskWorkspacePath: '   ' }).then(
      () => {
        assert.equal(calls.length, 0);
        assert.equal(errors.length, 1);
        assert.equal(enginePosted.length, 1);
        assert.equal(enginePosted[0].type, 'workflowFailed');
      },
    ),
  );
});

test('generateWorkflow rejects a whitespace-only workspace path', async () => {
  const { engine, calls, enginePosted } = makeEngine();
  const { panel } = makePanel();
  await withVscodeWindow({}, ({ errors }) =>
    route(engine, panel, {
      type: 'generateWorkflow',
      userInput: 'u',
      taskWorkspacePath: '   ',
    }).then(() => {
      assert.equal(calls.length, 0);
      assert.equal(errors.length, 1);
      assert.equal(enginePosted.length, 1);
      assert.equal(enginePosted[0].type, 'workflowFailed');
    }),
  );
});

test('generateWorkflow forwards all generation args', async () => {
  const { engine, calls } = makeEngine();
  const { panel } = makePanel();
  await route(engine, panel, {
    type: 'generateWorkflow',
    userInput: 'u',
    taskType: 'software',
    taskWorkspacePath: '/ws',
    polishContext: 'pc',
    clarifyAnswers: { a: '1' },
  });
  assert.equal(calls[0].method, 'generateWorkflow');
  assert.equal(calls[0].args[0], 'u');
  assert.equal(calls[0].args[1], 'software');
  assert.equal(calls[0].args[3], '/ws');
  assert.equal(calls[0].args[4], 'pc');
  assert.deepEqual(calls[0].args[5], { a: '1' });
});

test('startExecution forwards workflow and prefers sessionId over instanceKey', async () => {
  const { engine, calls } = makeEngine();
  const { panel } = makePanel();
  const workflow = { id: 'wf' };
  await route(engine, panel, {
    type: 'startExecution',
    workflow,
    sessionId: 'sess',
    instanceKey: 'inst',
  });
  assert.equal(calls[0].method, 'startExecution');
  assert.equal(calls[0].args[1], workflow);
  assert.equal(calls[0].args[2], 'sess');
});

test('startExecution falls back to instanceKey when sessionId absent', async () => {
  const { engine, calls } = makeEngine();
  const { panel } = makePanel();
  await route(engine, panel, { type: 'startExecution', workflow: {}, instanceKey: 'inst' });
  assert.equal(calls[0].args[2], 'inst');
});

test('approve forwards stageId', async () => {
  const { engine, calls } = makeEngine();
  const { panel } = makePanel();
  await route(engine, panel, { type: 'approve', stageId: 's1' });
  assert.equal(calls[0].method, 'approve');
  assert.equal(calls[0].args[0], 's1');
});

test('approveDecision forwards record and prefers sessionId', async () => {
  const { engine, calls } = makeEngine();
  const { panel } = makePanel();
  const decisionRecord = { choice: 'a' };
  await route(engine, panel, {
    type: 'approveDecision',
    stageId: 's1',
    decisionRecord,
    sessionId: 'sess',
    instanceKey: 'inst',
  });
  assert.equal(calls[0].method, 'approveDecision');
  assert.equal(calls[0].args[0], 's1');
  assert.equal(calls[0].args[1], decisionRecord);
  assert.equal(calls[0].args[3], 'sess');
});

test('approveDecision falls back to instanceKey when sessionId absent', async () => {
  const { engine, calls } = makeEngine();
  const { panel } = makePanel();
  await route(engine, panel, {
    type: 'approveDecision',
    stageId: 's1',
    decisionRecord: {},
    instanceKey: 'inst',
  });
  assert.equal(calls[0].method, 'approveDecision');
  assert.equal(calls[0].args[3], 'inst');
});

test('answerQuestionsBefore forwards stageId and answers', async () => {
  const { engine, calls } = makeEngine();
  const { panel } = makePanel();
  const answers = { q1: 'a' };
  await route(engine, panel, { type: 'answerQuestionsBefore', stageId: 's1', answers });
  assert.equal(calls[0].method, 'answerQuestionsBefore');
  assert.equal(calls[0].args[0], 's1');
  assert.equal(calls[0].args[1], answers);
});

test('answerQuestions forwards stageId and answers', async () => {
  const { engine, calls } = makeEngine();
  const { panel } = makePanel();
  const answers = { q1: 'a' };
  await route(engine, panel, { type: 'answerQuestions', stageId: 's1', answers });
  assert.equal(calls[0].method, 'answerQuestions');
  assert.equal(calls[0].args[1], answers);
});

test('retry forwards stageId and comment', async () => {
  const { engine, calls } = makeEngine();
  const { panel } = makePanel();
  await route(engine, panel, { type: 'retry', stageId: 's1', comment: 'redo' });
  assert.equal(calls[0].method, 'retry');
  assert.deepEqual(calls[0].args.slice(0, 2), ['s1', 'redo']);
});

test('copyDebugLog and copySessionLog route to artifacts', async () => {
  const { engine, calls } = makeEngine();
  const { panel } = makePanel();
  await route(engine, panel, { type: 'copyDebugLog' });
  await route(engine, panel, { type: 'copySessionLog' });
  assert.deepEqual(
    calls.map((c) => c.method),
    ['copyRecentDebugLog', 'copyRecentSessionLog'],
  );
});

test('editOutput forwards stageId, outputKey and content', async () => {
  const { engine, calls } = makeEngine();
  const { panel } = makePanel();
  await route(engine, panel, {
    type: 'editOutput',
    stageId: 's1',
    outputKey: 'out',
    newContent: 'hello',
  });
  assert.equal(calls[0].method, 'editOutput');
  assert.deepEqual(calls[0].args, ['s1', 'out', 'hello']);
});

test('openArtifactFile and openArtifactDiff forward stageId and filePath', async () => {
  const { engine, calls } = makeEngine();
  const { panel } = makePanel();
  await route(engine, panel, { type: 'openArtifactFile', stageId: 's1', filePath: '/a.txt' });
  await route(engine, panel, { type: 'openArtifactDiff', stageId: 's1', filePath: '/a.txt' });
  assert.deepEqual(calls[0].args, ['s1', '/a.txt']);
  assert.equal(calls[0].method, 'openArtifactFile');
  assert.deepEqual(calls[1].args, ['s1', '/a.txt']);
  assert.equal(calls[1].method, 'openArtifactDiff');
});

test('type-guarded handlers no-op when invoked with a mismatched message type', async () => {
  const { engine, calls } = makeEngine();
  const { panel } = makePanel();
  const map = buildPanelHandlerMap();
  const guarded = [
    'polishUserTask',
    'clarifyStart',
    'generateWorkflow',
    'startExecution',
    'approve',
    'approveDecision',
    'answerQuestionsBefore',
    'answerQuestions',
    'retry',
    'editOutput',
    'openArtifactFile',
    'openArtifactDiff',
  ] as const;
  for (const name of guarded) {
    const handler = map[name];
    assert.ok(handler, `handler ${name} should be registered`);
    await handler!({ engine, panel }, { type: '__mismatch__' } as unknown as FrontendMessage);
  }
  assert.equal(calls.length, 0);
});
