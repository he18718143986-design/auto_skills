import type { BackendMessage } from '../../WorkflowDefinition';
import { sessionStore } from './stores';

/** 绑定/切换 session，或生成期无实例上下文 — 不过滤 instanceKey。 */
const SESSION_OR_PRE_INSTANCE_TYPES = new Set<string>([
  'workflowGenerated',
  'instanceResumed',
  'instanceKeySynced',
  'sessionSynced',
  'instanceSwitchBlocked',
  'userTaskPolished',
  'clarifyQuestions',
  'generationProgress',
  'generationCancelled',
  'taskWorkspacePathPicked',
]);

function activeInstanceKey(): string | null {
  return sessionStore.activeInstanceKey ?? sessionStore.sessionId;
}

function messageInstanceKey(msg: BackendMessage): string | undefined {
  return msg.sessionId ?? msg.instanceKey;
}

/** dispatch 入口：丢弃不属于当前 activeInstanceKey 的运行期消息。 */
export function shouldAcceptBackendMessage(msg: BackendMessage): boolean {
  if (SESSION_OR_PRE_INSTANCE_TYPES.has(msg.type)) {
    return true;
  }
  const msgKey = messageInstanceKey(msg);
  const active = activeInstanceKey();
  if (!msgKey) {
    return active === null;
  }
  if (!active) {
    return true;
  }
  return msgKey === active;
}
