import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import Module from 'node:module';

/**
 * LlmClient 单测（M30.1）
 * ----------------------
 * LlmClient 顶层 `import * as vscode from 'vscode'`，而 `node --test` 进程无 vscode 运行时，
 * 因此先用 Module._load 拦截 'vscode' 注入轻量桩，再以动态 import 延迟加载 LlmClient
 * （拦截器须在 LlmClient 被 require 之前安装）。node 测试运行器按文件隔离子进程，桩不影响其它测试。
 *
 * 重点验证 #10：selectPreferredModels 按模型族记忆化（避免 DAG 并行每阶段一次 selectChatModels IPC），
 * 切换模型族 / invalidateModelCache 时失效，空结果不缓存（可重试）。
 */

let selectCalls = 0;
let stubSelect: (filter: { family?: string }) => Promise<unknown[]> = async () => [];
let configValues: Record<string, unknown> = {};

class StubCancellationTokenSource {
  private cancelled = false;
  private readonly callbacks: Array<() => void> = [];

  readonly token = {
    isCancellationRequested: false as boolean,
    onCancellationRequested: (cb: () => void) => {
      if (this.cancelled) {
        cb();
        return { dispose: () => undefined };
      }
      this.callbacks.push(cb);
      return {
        dispose: () => {
          const i = this.callbacks.indexOf(cb);
          if (i >= 0) {
            this.callbacks.splice(i, 1);
          }
        },
      };
    },
  };

  cancel(): void {
    if (this.cancelled) {
      return;
    }
    this.cancelled = true;
    this.token.isCancellationRequested = true;
    for (const cb of [...this.callbacks]) {
      cb();
    }
  }

  dispose(): void {
    this.callbacks.length = 0;
  }
}

const vscodeStub = {
  workspace: {
    getConfiguration: () => ({
      get: (key: string) => configValues[key],
    }),
  },
  lm: {
    selectChatModels: async (filter: { family?: string }) => {
      selectCalls++;
      return stubSelect(filter ?? {});
    },
  },
  CancellationTokenSource: StubCancellationTokenSource,
  LanguageModelChatMessage: {
    User: (content: string) => ({ role: 'user', content }),
  },
};

const moduleAny = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = moduleAny._load;
moduleAny._load = (request, parent, isMain) =>
  request === 'vscode' ? vscodeStub : originalLoad.call(Module, request, parent, isMain);

type LlmClientModule = typeof import('../LlmClient');
let cachedCtor: LlmClientModule['LlmClient'] | undefined;

async function loadCtor(): Promise<LlmClientModule['LlmClient']> {
  if (!cachedCtor) {
    cachedCtor = ((await import('../LlmClient')) as LlmClientModule).LlmClient;
  }
  return cachedCtor;
}

function makeClient(Ctor: LlmClientModule['LlmClient'], family: () => string) {
  return new Ctor({
    getPreferredModelFamily: family,
    postMessage: () => {},
    sessionLog: () => {},
    logUserAction: () => {},
  });
}

test('#10 selectPreferredModels caches resolved models per family', async () => {
  const Ctor = await loadCtor();
  selectCalls = 0;
  configValues = { llmApiKey: '', llmBaseUrl: 'https://api.openai.com/v1', llmModel: 'gpt-4o' };
  stubSelect = async (f) => (f.family === 'gpt-4o' ? [{ family: 'gpt-4o', vendor: 'copilot' }] : []);

  let family = 'gpt-4o';
  const client = makeClient(Ctor, () => family);

  const first = await client.selectPreferredModels();
  const second = await client.selectPreferredModels();
  assert.equal(first.length, 1);
  assert.equal(second, first, '缓存命中应返回同一数组引用');
  assert.equal(selectCalls, 1, '第二次调用应由缓存服务，不再查询 selectChatModels');

  client.invalidateModelCache();
  await client.selectPreferredModels();
  assert.equal(selectCalls, 2, 'invalidateModelCache 后应重新查询');

  family = 'claude-3.5-sonnet';
  stubSelect = async (f) => (f.family === 'claude-3.5-sonnet' ? [{ family: 'claude-3.5-sonnet' }] : []);
  const switched = await client.selectPreferredModels();
  assert.equal(
    (switched[0] as { family?: string }).family,
    'claude-3.5-sonnet',
    '模型族变化应触发重新解析',
  );
  assert.equal(selectCalls, 3);
});

test('#10 empty resolution is not cached (retries on next call)', async () => {
  const Ctor = await loadCtor();
  selectCalls = 0;
  configValues = { llmApiKey: '', llmBaseUrl: 'https://api.openai.com/v1', llmModel: 'gpt-4o' };
  stubSelect = async () => [];

  const client = makeClient(Ctor, () => 'gpt-4o');

  const first = await client.selectPreferredModels();
  assert.equal(first.length, 0, '无可用模型时返回空');
  const callsAfterFirst = selectCalls;
  assert.ok(callsAfterFirst > 0);

  const second = await client.selectPreferredModels();
  assert.equal(second.length, 0);
  assert.ok(selectCalls > callsAfterFirst, '空结果不应被缓存，下次调用须重试');
});

test('selectPreferredModels uses direct:<model> via stagent.llmApiKey without LM query', async () => {
  const Ctor = await loadCtor();
  selectCalls = 0;
  configValues = { llmApiKey: 'sk-test', llmBaseUrl: 'https://api.example.com/v1', llmModel: 'gpt-4o' };
  stubSelect = async () => [];

  const client = makeClient(Ctor, () => 'direct:my-model');
  const models = await client.selectPreferredModels();
  assert.equal(models.length, 1, 'direct: 应直接构造 HTTP 模型');
  assert.equal(selectCalls, 0, 'direct: 路径不应查询 vscode.lm.selectChatModels');
});

test('selectPreferredModels logs all_attempts_failed when every strategy fails', async () => {
  const Ctor = await loadCtor();
  selectCalls = 0;
  configValues = { llmApiKey: '', llmBaseUrl: 'https://api.openai.com/v1', llmModel: 'gpt-4o' };
  stubSelect = async () => {
    throw new Error('lm unavailable');
  };

  const sessionLogs: Array<{ stageId: string; event: string; payload?: unknown }> = [];
  const warns: string[] = [];
  const client = new Ctor({
    getPreferredModelFamily: () => 'gpt-4o',
    postMessage: () => {},
    sessionLog: (stageId, event, payload) => {
      sessionLogs.push({ stageId, event, payload });
    },
    logUserAction: () => {},
    warn: (msg) => {
      warns.push(msg);
    },
  });

  const models = await client.selectPreferredModels();
  assert.equal(models.length, 0);
  const failed = sessionLogs.find((l) => l.event === 'all_attempts_failed');
  assert.ok(failed, '应写入 all_attempts_failed sessionLog');
  assert.equal(failed!.stageId, 'llm-model-select');
  const payload = failed!.payload as { attempts?: unknown[] };
  assert.ok(Array.isArray(payload.attempts) && payload.attempts.length > 0);
  assert.ok(warns.some((w) => w.includes('LLM model selection failed')));
});

test('summarizeText passes idle timeout token and onActivity to sendRequest', async () => {
  const Ctor = await loadCtor();
  selectCalls = 0;
  configValues = {
    llmApiKey: '',
    llmBaseUrl: 'https://api.openai.com/v1',
    llmModel: 'gpt-4o',
    llmTimeoutSeconds: 30,
  };
  let capturedToken: { isCancellationRequested: boolean } | undefined;
  let capturedOnActivity: (() => void) | undefined;
  stubSelect = async () => [
    {
      family: 'gpt-4o',
      vendor: 'copilot',
      sendRequest: async (
        _messages: unknown,
        options: { modelOptions?: { onActivity?: () => void } },
        token: { isCancellationRequested: boolean },
      ) => {
        capturedToken = token;
        capturedOnActivity = options.modelOptions?.onActivity;
        async function* text() {
          yield 'summary';
        }
        return { text: text() };
      },
    },
  ];

  const client = makeClient(Ctor, () => 'gpt-4o');
  const out = await client.summarizeText('stage_ctx', 'compress this');
  assert.equal(out, 'summary');
  assert.ok(capturedToken !== undefined, 'sendRequest 应收到 CancellationToken');
  assert.equal(typeof capturedOnActivity, 'function', 'sendRequest 应收到 onActivity');
});

test('summarizeText returns undefined when sendRequest fails', async () => {
  const Ctor = await loadCtor();
  configValues = { llmApiKey: '', llmBaseUrl: 'https://api.openai.com/v1', llmModel: 'gpt-4o' };
  stubSelect = async () => [
    {
      family: 'gpt-4o',
      sendRequest: async () => {
        throw new Error('cancelled');
      },
    },
  ];
  const sessionLogs: Array<{ event: string; payload?: unknown }> = [];
  const debugLogs: Array<{ event: string; payload?: unknown }> = [];
  const client = new Ctor({
    getPreferredModelFamily: () => 'gpt-4o',
    postMessage: () => {},
    sessionLog: (_stageId, event, payload) => {
      sessionLogs.push({ event, payload });
    },
    logUserAction: () => {},
    debugLog: (_stageId, event, _attempt, payload) => {
      debugLogs.push({ event, payload });
    },
  });
  const out = await client.summarizeText('stage_ctx', 'x');
  assert.equal(out, undefined);
  assert.ok(sessionLogs.some((l) => l.event === 'input_summary_error'));
  assert.ok(
    debugLogs.some(
      (l) =>
        l.event === 'input_summary_skipped' &&
        (l.payload as { reason?: string })?.reason === 'invoke_error',
    ),
  );
});

test('summarizeText logs skipped when no model available', async () => {
  const Ctor = await loadCtor();
  configValues = { llmApiKey: '', llmBaseUrl: 'https://api.openai.com/v1', llmModel: 'gpt-4o' };
  stubSelect = async () => [];
  const debugLogs: Array<{ event: string; payload?: unknown }> = [];
  const client = new Ctor({
    getPreferredModelFamily: () => 'gpt-4o',
    postMessage: () => {},
    sessionLog: () => {},
    logUserAction: () => {},
    debugLog: (_stageId, event, _attempt, payload) => {
      debugLogs.push({ event, payload });
    },
  });
  const out = await client.summarizeText('stage_ctx', 'x');
  assert.equal(out, undefined);
  assert.ok(
    debugLogs.some(
      (l) =>
        l.event === 'input_summary_skipped' &&
        (l.payload as { reason?: string })?.reason === 'no_model',
    ),
  );
});
