/**
 * Webview 状态聚合导出；可变字段真源见 `./stores/*`。
 */
export { DEFAULT_TASK_TYPE } from './stores/constants';
export { stageMaps } from './stores/execStore';
export {
  confirmStore,
  execStore,
  inputStore,
  resetConfirmStore,
  resetExecStore,
  resetInputStore,
  resetSessionStore,
  sessionStore,
} from './stores';
