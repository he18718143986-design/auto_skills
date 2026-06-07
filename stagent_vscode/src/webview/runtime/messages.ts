import { isBackendMessage } from '../../WebviewMessageGuards';
import { shouldAcceptBackendMessage } from './backendMessageInstanceGate';
import { shouldAcceptUiEpoch } from './uiEpochGate';
import { buildBackendHandlerMap } from './backend-handlers/registry';

export function registerMessageHandler(): void {
  const handlers = buildBackendHandlerMap();
  window.addEventListener('message', (event: MessageEvent) => {
    if (!isBackendMessage(event.data)) {
      return;
    }
    if (!shouldAcceptBackendMessage(event.data)) {
      return;
    }
    if (!shouldAcceptUiEpoch(event.data)) {
      return;
    }
    const handler = handlers[event.data.type];
    if (handler) {
      handler(event.data);
      return;
    }
    console.warn(`[Stagent webview] backend_message_unhandled type=${event.data.type}`);
  });
}
