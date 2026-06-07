import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import Module from 'node:module';

class StubCancellationToken {
  private readonly callbacks: Array<() => void> = [];
  readonly token = {
    isCancellationRequested: false as boolean,
    onCancellationRequested: (cb: () => void) => {
      this.callbacks.push(cb);
      return { dispose: () => undefined };
    },
  };
  cancel(): void {
    this.token.isCancellationRequested = true;
    for (const cb of this.callbacks) {
      cb();
    }
  }
}

const vscodeStub = {
  LanguageModelChatMessageRole: { User: 1, Assistant: 2 },
  LanguageModelChatMessage: {
    User: (content: string) => ({ role: 1, content }),
  },
};

type LoadFn = (request: string, parent: unknown, isMain: boolean) => unknown;
const moduleAny = Module as unknown as {
  _load: LoadFn & { __openAiLlmStub?: boolean };
};
if (!moduleAny._load.__openAiLlmStub) {
  const originalLoad = moduleAny._load;
  moduleAny._load = function openAiLlmStubLoad(request, parent, isMain) {
    return request === 'vscode' ? vscodeStub : originalLoad.call(Module, request, parent, isMain);
  };
  moduleAny._load.__openAiLlmStub = true;
}

test('DirectHttpLmModel aborts fetch when maxRequestMs elapses before response', async () => {
  const prevFetch = globalThis.fetch;
  globalThis.fetch = ((_url, init) =>
    new Promise((_resolve, reject) => {
      const signal = init?.signal;
      if (signal?.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      signal?.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'));
      });
    })) as typeof fetch;

  try {
    const { DirectHttpLmModel } = await import('../OpenAiCompatibleLlm');
    const model = new DirectHttpLmModel('key', 'https://example.com/v1', 'm', 1024);
    const cts = new StubCancellationToken();
    const response = await model.sendRequest(
      [vscodeStub.LanguageModelChatMessage.User('hi') as never],
      { modelOptions: { maxRequestMs: 40 } },
      cts.token as never,
    );

    const iter = response.text[Symbol.asyncIterator]();
    await assert.rejects(
      () => iter.next(),
      (err: unknown) =>
        err instanceof Error && err.message.includes('LLM API 请求超时或已取消'),
    );
  } finally {
    globalThis.fetch = prevFetch;
  }
});
