import type { BackendHandlerMap } from './types';
import { generationHandlers } from './generation';
import { instanceSyncHandlers } from './instance-sync';
import { executionUiHandlers } from './execution-ui';
import { hitlUiHandlers } from './hitl-ui';
import { artifactsErrorsHandlers } from './artifacts-errors';

export function buildBackendHandlerMap(): BackendHandlerMap {
  return {
    ...generationHandlers,
    ...instanceSyncHandlers,
    ...executionUiHandlers,
    ...hitlUiHandlers,
    ...artifactsErrorsHandlers,
  };
}
