import { resetConfirmStore, resetInputStore } from './stores';
import { resetExecUi } from './view-exec';

/** 跨实例切换/恢复：清 input + confirm 元数据 + exec UI 与 stageMaps。 */
export function resetInstanceScopedUiState(): void {
  resetInputStore();
  resetConfirmStore();
  resetExecUi();
}
