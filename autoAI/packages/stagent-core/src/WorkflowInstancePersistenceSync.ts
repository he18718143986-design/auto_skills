import type { WorkflowInstance } from './WorkflowDefinition';

export const WF_STATE_FILE_NAME = '.wf-state.json';

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

  const instance = (gs ?? file)!;
  return { kind: 'loaded', instance, promoteToGlobalState: !gs && !!file };
}
