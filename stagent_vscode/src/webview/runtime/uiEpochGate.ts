import type { BackendMessage } from '../../WorkflowDefinition';

/**
 * UI resync 代数门禁。
 *
 * 宽松模式（过渡期）：`uiEpoch == null` 的旧消息/单测仍放行。
 * 待 Bridge 全路径注入 uiEpoch 且单测迁移完成后，将 `UI_EPOCH_GATE_STRICT` 设为 `true`；
 * 届时可删除宽松分支。
 */
export const UI_EPOCH_GATE_STRICT = false;

/** session / 生成期消息不过滤 uiEpoch（与 backendMessageInstanceGate 对齐）。 */
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

let lastAcceptedUiEpoch = 0;

export function getLastAcceptedUiEpoch(): number {
  return lastAcceptedUiEpoch;
}

export function resetUiEpochState(): void {
  lastAcceptedUiEpoch = 0;
}

/** instanceResumed：接受快照 epoch（通常高于 prior live 消息）。 */
export function acceptUiEpochFromInstanceResumed(uiEpoch?: number): void {
  if (typeof uiEpoch === 'number' && uiEpoch >= lastAcceptedUiEpoch) {
    lastAcceptedUiEpoch = uiEpoch;
  }
}

/** dispatch 入口：丢弃 stale resync 之前的 live 消息。 */
export function shouldAcceptUiEpoch(msg: BackendMessage): boolean {
  if (SESSION_OR_PRE_INSTANCE_TYPES.has(msg.type)) {
    return true;
  }
  if (UI_EPOCH_GATE_STRICT && msg.uiEpoch == null) {
    return false;
  }
  if (typeof msg.uiEpoch === 'number' && msg.uiEpoch < lastAcceptedUiEpoch) {
    return false;
  }
  return true;
}
