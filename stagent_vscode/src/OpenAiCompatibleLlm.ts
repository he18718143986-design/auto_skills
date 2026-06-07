import * as vscode from 'vscode';
import { LOG_PREVIEW_MEDIUM } from './LogPreviewLimits';
import { parseSseDeltaStream } from './SseDeltaStream';

/** 与 vscode.lm 返回的真实模型区分，供日志 channel 等使用 */
export const STAGENT_DIRECT_HTTP_VENDOR = 'stagent-direct-http';

/**
 * #8：直连 HTTP 模型无 tokenizer，给出启发式 token 估算（供 InputContextPolicy 预算分配，
 * 不要求精确，只需单调可比、量级正确）。CJK/全角字符 ≈ 1 token/字；其余 ≈ 1 token/4 字符。
 */
export function estimateTokenCount(text: string): number {
  if (!text) {
    return 0;
  }
  let cjk = 0;
  let other = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    const isCjk =
      (code >= 0x4e00 && code <= 0x9fff) || // CJK 统一表意
      (code >= 0x3400 && code <= 0x4dbf) || // 扩展 A
      (code >= 0x3000 && code <= 0x30ff) || // CJK 标点 + 假名
      (code >= 0xac00 && code <= 0xd7af) || // 谚文
      (code >= 0xff00 && code <= 0xffef); // 全角
    if (isCjk) {
      cjk++;
    } else {
      other++;
    }
  }
  return cjk + Math.ceil(other / 4);
}

function extractMessageText(m: vscode.LanguageModelChatMessage): string {
  const { content } = m;
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((p) => {
        if (typeof p === 'string') {
          return p;
        }
        if (p && typeof p === 'object' && 'value' in p && typeof (p as { value?: unknown }).value === 'string') {
          return (p as { value: string }).value;
        }
        return '';
      })
      .join('');
  }
  return '';
}

/**
 * OpenAI 兼容 HTTP 语言模型（DeepSeek / OpenAI / 其它兼容 /v1/chat/completions 的服务）。
 * 作为 {@link vscode.LanguageModelChat} 注入到 `selectPreferredModels`，与 Copilot 路径共用 `sendRequest` + `response.text` 流式消费。
 */
export class DirectHttpLmModel implements vscode.LanguageModelChat {
  readonly name: string;
  readonly id: string;
  readonly vendor = STAGENT_DIRECT_HTTP_VENDOR;
  readonly family: string;
  readonly version = '1';
  readonly maxInputTokens = 256_000;

  private readonly baseUrl: string;
  private readonly maxOutputTokens: number;

  constructor(
    private readonly apiKey: string,
    baseUrl: string,
    private readonly modelName: string,
    maxOutputTokens: number,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.maxOutputTokens = maxOutputTokens;
    this.name = `direct:${modelName}`;
    this.id = `${STAGENT_DIRECT_HTTP_VENDOR}:${modelName}`;
    this.family = `direct:${modelName}`;
  }

  countTokens(text: string | vscode.LanguageModelChatMessage, _token?: vscode.CancellationToken): Thenable<number> {
    const s = typeof text === 'string' ? text : extractMessageText(text);
    return Promise.resolve(estimateTokenCount(s));
  }

  sendRequest(
    messages: vscode.LanguageModelChatMessage[],
    _options: vscode.LanguageModelChatRequestOptions | undefined,
    token: vscode.CancellationToken,
  ): Thenable<vscode.LanguageModelChatResponse> {
    const apiMessages = messages.map((m) => ({
      role: m.role === vscode.LanguageModelChatMessageRole.User ? ('user' as const) : ('assistant' as const),
      content: extractMessageText(m),
    }));

    const ac = new AbortController();
    const sub = token.onCancellationRequested(() => ac.abort());

    // 空闲超时存活回调：引擎经 modelOptions 注入。推理模型作答前的思维链
    // （reasoning_content）流量也会重置空闲计时器，避免长思考被误判卡死。
    const onActivity =
      typeof _options?.modelOptions?.['onActivity'] === 'function'
        ? (_options.modelOptions['onActivity'] as () => void)
        : undefined;
    const maxRequestMsRaw = _options?.modelOptions?.['maxRequestMs'];
    const maxRequestMs =
      typeof maxRequestMsRaw === 'number' && Number.isFinite(maxRequestMsRaw) && maxRequestMsRaw > 0
        ? Math.floor(maxRequestMsRaw)
        : 0;

    const base = this.baseUrl;
    const key = this.apiKey;
    const model = this.modelName;
    const maxTokens =
      typeof _options?.modelOptions?.max_tokens === 'number' &&
      Number.isFinite(_options.modelOptions.max_tokens)
        ? Math.floor(_options.modelOptions.max_tokens)
        : this.maxOutputTokens;

    let wallTimer: ReturnType<typeof setTimeout> | undefined;
    if (maxRequestMs > 0) {
      wallTimer = setTimeout(() => ac.abort(), maxRequestMs);
    }

    const text = (async function* (): AsyncGenerator<string> {
      try {
        const res = await fetch(`${base}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages: apiMessages,
            stream: true,
            max_tokens: maxTokens,
          }),
          signal: ac.signal,
        });
        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          throw new Error(
            `LLM API 请求失败 [${res.status}]: ${errText.slice(0, LOG_PREVIEW_MEDIUM)}`,
          );
        }
        const body = res.body;
        if (!body) {
          throw new Error('LLM API 响应无 body');
        }
        yield* parseSseDeltaStream(body, ac.signal, onActivity);
      } catch (e) {
        if (maxRequestMs > 0 && ac.signal.aborted) {
          const raw = e instanceof Error ? e.message : String(e);
          const lower = raw.toLowerCase();
          if (lower.includes('abort') || lower.includes('cancel')) {
            throw new Error(
              `LLM API 请求超时或已取消（总时长上限约 ${Math.round(maxRequestMs / 1000)} 秒，与 stagent.llmTimeoutSeconds 一致）。`,
            );
          }
        }
        throw e;
      } finally {
        if (wallTimer !== undefined) {
          clearTimeout(wallTimer);
        }
        sub.dispose();
      }
    })();

    return Promise.resolve({
      text,
      stream: text as unknown as vscode.LanguageModelChatResponse['stream'],
    } as vscode.LanguageModelChatResponse);
  }
}
