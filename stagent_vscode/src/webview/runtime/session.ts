import { sessionStore } from './stores';

/** 从 backend 消息写入 sessionId（M44 单一指针）。 */
export function applySessionFromBackend(msg: {
  sessionId?: string;
  instanceKey?: string;
}): void {
  const sid = msg.sessionId ?? msg.instanceKey;
  if (sid) {
    sessionStore.sessionId = sid;
    sessionStore.draftInstanceKey = sid;
    sessionStore.activeInstanceKey = sid;
  }
}

/** webview → engine 出站 sessionId。 */
export function getOutboundSessionId(): string | undefined {
  return sessionStore.sessionId ?? sessionStore.activeInstanceKey ?? sessionStore.draftInstanceKey ?? undefined;
}
