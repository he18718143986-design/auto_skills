import type { BackendMessage } from '../../../WorkflowDefinition';

export type BackendMessageHandler = (msg: BackendMessage) => void;

export type BackendHandlerMap = Partial<Record<BackendMessage['type'], BackendMessageHandler>>;
