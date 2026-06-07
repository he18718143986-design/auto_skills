/**
 * 任务目录下 `.wf-state.json` 的读写（M12.3：与引擎 `resumeInstance` 配合；
 * DAG 模式下恢复后的 `currentStageIndex` 对齐由 `WorkflowEngine` 调用 `syncDagCurrentStageIndex` 完成，本模块保持无执行语义）。
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  globalStorageInstanceDir,
  taskInstanceDir,
} from './paths/StagentPaths';
import type { WorkflowInstance } from './WorkflowDefinition';
import {
  atomicWriteTextFile,
  atomicWriteTextFileSync,
  DEFAULT_FS_READ_TIMEOUT_MS,
  pathExists,
  readTextFileIfExists,
} from './FsAsync';
import { WF_STATE_FILE_NAME } from './WorkflowInstancePersistenceSync';
import { serializeInstanceForDisk, unwrapInstanceFromDisk } from './WorkflowStateEnvelope';

export interface InstanceTaskDirHint {
  taskDir?: string;
  taskWorkspacePath?: string;
}

export function getDefaultTaskDir(
  instanceId: string,
  workspacePath: string | undefined,
  globalStoragePath: string,
): string {
  if (workspacePath) {
    return taskInstanceDir(workspacePath, instanceId);
  }
  return globalStorageInstanceDir(globalStoragePath, instanceId);
}

/** 解析实例状态目录：优先 instance.taskDir，其次 meta.taskWorkspacePath，最后 VS Code 工作区 / globalStorage。 */
export function resolveInstanceTaskDir(
  instanceKey: string,
  hint: InstanceTaskDirHint | undefined,
  workspaceFolderPath: string | undefined,
  globalStoragePath: string,
): string {
  const taskDir = hint?.taskDir?.trim();
  if (taskDir) {
    return taskDir;
  }
  const taskWorkspacePath = hint?.taskWorkspacePath?.trim();
  if (taskWorkspacePath) {
    return taskInstanceDir(path.resolve(taskWorkspacePath), instanceKey);
  }
  return getDefaultTaskDir(instanceKey, workspaceFolderPath, globalStoragePath);
}

export function instanceDiskStateFileExists(
  instanceKey: string,
  hint: InstanceTaskDirHint | undefined,
  workspaceFolderPath: string | undefined,
  globalStoragePath: string,
): boolean {
  const dir = resolveInstanceTaskDir(instanceKey, hint, workspaceFolderPath, globalStoragePath);
  return fs.existsSync(path.join(dir, WF_STATE_FILE_NAME));
}

export function getStateFilePath(
  instanceKey: string,
  workspacePath: string | undefined,
  globalStoragePath: string,
  taskDir?: string,
): string {
  const dir = taskDir ?? getDefaultTaskDir(instanceKey, workspacePath, globalStoragePath);
  return path.join(dir, WF_STATE_FILE_NAME);
}

export function persistInstanceFile(
  instanceKey: string,
  instance: WorkflowInstance,
  workspacePath: string | undefined,
  globalStoragePath: string,
): void {
  const taskDir = instance.taskDir ?? getDefaultTaskDir(instanceKey, workspacePath, globalStoragePath);
  instance.taskDir = taskDir;
  fs.mkdirSync(taskDir, { recursive: true });
  const statePath = getStateFilePath(instanceKey, workspacePath, globalStoragePath, taskDir);
  atomicWriteTextFileSync(statePath, serializeInstanceForDisk(instance));
}

/** #7：异步持久化 `.wf-state.json`（热路径 `scheduleSave` 使用）。 */
export async function persistInstanceFileAsync(
  instanceKey: string,
  instance: WorkflowInstance,
  workspacePath: string | undefined,
  globalStoragePath: string,
): Promise<void> {
  const taskDir = instance.taskDir ?? getDefaultTaskDir(instanceKey, workspacePath, globalStoragePath);
  instance.taskDir = taskDir;
  const statePath = getStateFilePath(instanceKey, workspacePath, globalStoragePath, taskDir);
  await atomicWriteTextFile(statePath, serializeInstanceForDisk(instance));
}

/** 同步读盘（里程碑/恢复）；热路径请用 {@link readInstanceFileAsync}。 */
export function readInstanceFile(
  instanceKey: string,
  workspacePath: string | undefined,
  globalStoragePath: string,
  taskDir?: string,
  warn?: (message: string) => void,
): WorkflowInstance | undefined {
  const statePath = getStateFilePath(instanceKey, workspacePath, globalStoragePath, taskDir);
  if (!fs.existsSync(statePath)) {
    return undefined;
  }
  const raw = fs.readFileSync(statePath, 'utf-8');
  const parsed: unknown = JSON.parse(raw);
  return unwrapInstanceFromDisk(parsed, warn);
}

/** #7：异步读取 `.wf-state.json`。 */
export async function readInstanceFileAsync(
  instanceKey: string,
  workspacePath: string | undefined,
  globalStoragePath: string,
  taskDir?: string,
  warn?: (message: string) => void,
): Promise<WorkflowInstance | undefined> {
  const statePath = getStateFilePath(instanceKey, workspacePath, globalStoragePath, taskDir);
  const raw = await readTextFileIfExists(statePath, { timeoutMs: DEFAULT_FS_READ_TIMEOUT_MS });
  if (raw === undefined) {
    return undefined;
  }
  const parsed: unknown = JSON.parse(raw);
  return unwrapInstanceFromDisk(parsed, warn);
}

/** #7：异步探测磁盘状态文件是否存在。 */
export async function instanceDiskStateFileExistsAsync(
  instanceKey: string,
  hint: InstanceTaskDirHint | undefined,
  workspaceFolderPath: string | undefined,
  globalStoragePath: string,
): Promise<boolean> {
  const dir = resolveInstanceTaskDir(instanceKey, hint, workspaceFolderPath, globalStoragePath);
  return pathExists(path.join(dir, WF_STATE_FILE_NAME));
}
