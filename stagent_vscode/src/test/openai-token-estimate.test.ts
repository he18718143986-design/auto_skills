import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import Module from 'node:module';

/**
 * #8：estimateTokenCount 单测。OpenAiCompatibleLlm 顶层 `import * as vscode`，node:test 无 vscode 运行时，
 * 故拦截 'vscode' 注入空桩后再动态加载（模块顶层不调用 vscode API，仅用其类型）。
 */
const vscodeStub = {};
const moduleAny = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = moduleAny._load;
moduleAny._load = (request, parent, isMain) =>
  request === 'vscode' ? vscodeStub : originalLoad.call(Module, request, parent, isMain);

type LlmModule = typeof import('../OpenAiCompatibleLlm');
let estimateTokenCount: LlmModule['estimateTokenCount'] | undefined;

async function load(): Promise<LlmModule['estimateTokenCount']> {
  if (!estimateTokenCount) {
    estimateTokenCount = ((await import('../OpenAiCompatibleLlm')) as LlmModule).estimateTokenCount;
  }
  return estimateTokenCount;
}

test('#8 empty string is 0 tokens', async () => {
  const est = await load();
  assert.equal(est(''), 0);
});

test('#8 ASCII text ≈ chars/4', async () => {
  const est = await load();
  assert.equal(est('abcd'), 1);
  assert.equal(est('a'.repeat(40)), 10);
});

test('#8 CJK characters ≈ 1 token each', async () => {
  const est = await load();
  assert.equal(est('你好世界'), 4);
});

test('#8 no longer returns a constant 0 for non-empty input (regression on the old stub)', async () => {
  const est = await load();
  assert.ok(est('hello world this is a longer prompt') > 0);
  assert.ok(est('这是一段中文输入') > 0);
});

test('#8 estimate is monotonic in length (longer text -> not fewer tokens)', async () => {
  const est = await load();
  const short = est('short');
  const long = est('short' + ' more words appended to make it longer'.repeat(3));
  assert.ok(long >= short);
});
