/**
 * 按行缓冲解析 OpenAI 兼容 SSE，避免 chunk 切断 `data:` 行。
 *
 * 仅 yield 正文增量（`delta.content`）。`onActivity` 会在收到「任何」服务端流量
 * 时触发——包括推理模型在作答前流式输出的思维链（`reasoning_content`）、SSE
 * keepalive 注释行等。调用方据此重置「空闲超时」，避免长思考阶段（只发
 * reasoning、不发 content）被误判为卡死而中断。
 */
export async function* parseSseDeltaStream(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  onActivity?: () => void,
  onFinishReason?: (reason: string) => void,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      // 任何字节到达都视为「连接存活」：覆盖思维链增量、keepalive、半行等，
      // 不依赖能否解析出正文，从根本上避免推理模型思考期被空闲超时误杀。
      if (value && value.length > 0) {
        onActivity?.();
      }
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) {
          continue;
        }
        const data = trimmed.slice(5).trimStart();
        if (data === '[DONE]') {
          continue;
        }
        try {
          const json = JSON.parse(data) as {
            choices?: { delta?: { content?: string }; finish_reason?: string | null }[];
          };
          const choice = json.choices?.[0];
          const delta = choice?.delta?.content ?? '';
          if (delta) {
            yield delta;
          }
          // 透传 finish_reason（'length' 表示因 max_tokens 截断），供截断判定优先使用。
          if (choice?.finish_reason) {
            onFinishReason?.(choice.finish_reason);
          }
        } catch {
          /* SSE 半行或厂商扩展行 */
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
