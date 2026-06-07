/**
 * WorkflowUiBridge / 宿主 postMessage 出站字段注入（traceId、instanceKey）。
 */
import { withTraceId } from './InstanceSession';
import type { BackendMessage } from './WorkflowDefinition';
import type { MessagingHost } from './WorkflowEngineMessaging';

export function enrichBackendMessageTraceId(host: MessagingHost, msg: BackendMessage): BackendMessage {
  if (msg.type !== 'stageError' && msg.type !== 'workflowFailed' && msg.type !== 'workflowCompleted') {
    return msg;
  }
  if (msg.traceId) {
    return msg;
  }
  const traceId = host.getInstance()?.traceId;
  return { ...msg, ...withTraceId(traceId) };
}

/** 执行期消息注入 instanceKey/sessionId（与 M44 session 指针对齐）。 */
export function enrichBackendMessageInstanceKey(host: MessagingHost, msg: BackendMessage): BackendMessage {
  const existing = msg.instanceKey ?? msg.sessionId;
  if (existing) {
    return {
      ...msg,
      instanceKey: msg.instanceKey ?? existing,
      sessionId: msg.sessionId ?? existing,
    };
  }
  const key = host.getCurrentInstanceKey();
  if (!key) {
    return msg;
  }
  return { ...msg, instanceKey: key, sessionId: key };
}

export function enrichBackendMessageForWebview(
  host: MessagingHost,
  msg: BackendMessage,
  seq: number,
  uiEpoch: number,
): BackendMessage {
  return enrichBackendMessageInstanceKey(
    host,
    enrichBackendMessageTraceId(host, { ...msg, seq, uiEpoch }),
  );
}
