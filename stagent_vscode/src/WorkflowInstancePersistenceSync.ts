import type { WorkflowInstance } from './WorkflowDefinition';
import { instancePersistRevision } from './WorkflowStateEnvelope';

export { WF_STATE_FILE_NAME } from './paths/StagentPaths';

export type InstanceLoadSyncResult =
  | { kind: 'absent' }
  | { kind: 'purge_global'; reason: 'disk_state_missing' }
  | { kind: 'loaded'; instance: WorkflowInstance; promoteToGlobalState: boolean };

/**
 * 磁盘 `.wf-state.json` 为真源：若 globalState 有副本但磁盘状态文件已不存在，
 * 视为用户已删除任务，purge globalState 而非从内存重建磁盘目录。
 */
export function resolveInstanceLoadSync(args: {
  globalStateInstance?: WorkflowInstance;
  diskInstance?: WorkflowInstance;
  diskStateFileExists: boolean;
}): InstanceLoadSyncResult {
  const { globalStateInstance: gs, diskInstance: file, diskStateFileExists } = args;

  if (gs && !diskStateFileExists) {
    return { kind: 'purge_global', reason: 'disk_state_missing' };
  }

  if (!gs && !file) {
    return { kind: 'absent' };
  }

  if (gs && file) {
    // 双写对账：取 persistRevision 较大的副本为权威。崩溃在 debounce 窗口内时，
    // 磁盘可能已写出更新的 revision 而 globalState 后台重试未完成；按世代号选取
    // 可避免旧 globalState 覆盖较新的磁盘状态。相等时维持原行为（信 globalState）。
    const gsRev = instancePersistRevision(gs);
    const fileRev = instancePersistRevision(file);
    if (fileRev > gsRev) {
      return { kind: 'loaded', instance: file, promoteToGlobalState: true };
    }
    return { kind: 'loaded', instance: gs, promoteToGlobalState: false };
  }

  const instance = (gs ?? file)!;
  return { kind: 'loaded', instance, promoteToGlobalState: !gs && !!file };
}

/**
 * 侧栏任务列表：展示用加载，不因「globalState 有、磁盘尚未写出」而 purge。
 * 恢复/绑定实例仍用 {@link resolveInstanceLoadSync}（磁盘为真源）。
 */
export function resolveInstanceForTaskList(args: {
  globalStateInstance?: WorkflowInstance;
  diskInstance?: WorkflowInstance;
}): { instance?: WorkflowInstance; promoteToGlobalState: boolean } {
  const { globalStateInstance: gs, diskInstance: file } = args;
  if (gs) {
    return { instance: gs, promoteToGlobalState: false };
  }
  if (file) {
    return { instance: file, promoteToGlobalState: true };
  }
  return { promoteToGlobalState: false };
}
