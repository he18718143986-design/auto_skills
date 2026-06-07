import type { BackendMessage, FrontendMessage } from './WorkflowDefinition';
import { BACKEND_MESSAGE_TYPES } from './generated/backendMessageTypes';

const BACKEND_MESSAGE_TYPES_SET = new Set<string>(BACKEND_MESSAGE_TYPES);

function isRecordWithType(msg: unknown): msg is { type: string } {
  return typeof msg === 'object' && msg !== null && typeof (msg as { type?: unknown }).type === 'string';
}

/** 宿主侧：与历史行为一致（任意带 type 的对象）。 */
export function isFrontendMessage(msg: unknown): msg is FrontendMessage {
  return isRecordWithType(msg);
}

/** Webview / 宿主共用：已知 BackendMessage 判别。 */
export function isBackendMessage(msg: unknown): msg is BackendMessage {
  return isRecordWithType(msg) && BACKEND_MESSAGE_TYPES_SET.has(msg.type);
}
