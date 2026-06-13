import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import type * as vscode from 'vscode';
import type { BackendMessage } from '../WorkflowDefinition';
import {
  handleGenerateClarifyQuestions,
  type PreGenerationHost,
} from '../WorkflowPreGenerationCoordinator';

function makePanel(): vscode.WebviewPanel {
  return { webview: {} } as vscode.WebviewPanel;
}

function makeHost(opts: { llmQuestions?: Array<{ id: string; text: string }>; onLlm?: () => void }): {
  host: PreGenerationHost;
  posted: BackendMessage[];
} {
  const posted: BackendMessage[] = [];
  const host: PreGenerationHost = {
    bindPanel: () => {},
    postMessage: (_panel, msg) => {
      posted.push(msg);
    },
    postGenerationProgress: () => {},
    ensurePreExecDraftShell: () => undefined,
    polishCacheKey: () => 'k',
    getPolishCacheHit: () => undefined,
    rememberPolishCache: () => {},
    getCurrentInstanceKey: () => undefined,
    invokeLlmRaw: async () => {
      opts.onLlm?.();
      return JSON.stringify({ questions: opts.llmQuestions ?? [{ id: 'q1', text: '交付形态？' }] });
    },
    warn: () => {},
    degraded: () => {},
  };
  return { host, posted };
}

test('handleGenerateClarifyQuestions skips LLM when requirement is clear enough', async () => {
  let llmCalled = false;
  const { host, posted } = makeHost({ onLlm: () => {
    llmCalled = true;
  } });
  const panel = makePanel();
  await handleGenerateClarifyQuestions(
    host,
    '空目录 Python 单文件 greet 函数，pytest 单切片验收，目标是最小可运行交付',
    'auto',
    '/tmp/empty-ws',
    panel,
  );
  assert.equal(llmCalled, false);
  const msg = posted.find((m) => m.type === 'clarifyQuestions');
  assert.ok(msg);
  assert.deepEqual((msg as { questions?: unknown[] }).questions, []);
});

test('handleGenerateClarifyQuestions asks LLM when requirement is vague', async () => {
  let llmCalled = false;
  const { host, posted } = makeHost({
    onLlm: () => {
      llmCalled = true;
    },
    llmQuestions: [{ id: 'q_scope', text: '交付范围？' }],
  });
  const panel = makePanel();
  await handleGenerateClarifyQuestions(host, '做一个 todo MVP', 'auto', '/tmp/empty-ws', panel);
  assert.equal(llmCalled, true);
  const msg = posted.find((m) => m.type === 'clarifyQuestions');
  assert.ok(msg);
  assert.equal((msg as { questions?: Array<{ id: string }> }).questions?.[0]?.id, 'q_scope');
});
