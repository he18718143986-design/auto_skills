import {
  isWorkflowInstanceGlobalStateKey,
  parseInstanceKeyFromGlobalStateKey,
} from './instance/InstanceGlobalStateKeys';
import type { WorkflowInstance } from './WorkflowDefinition';
import { AUTO_TASK_TYPE } from './TaskTypeResolution';

export function isRecoverableInstance(inst: WorkflowInstance): boolean {
  return inst.status === 'idle' || inst.status === 'running' || inst.status === 'failed';
}

export function getRecoverableInstanceKeysFromGlobalStateKeys(
  keys: readonly string[],
  loadByKey: (instanceKey: string) => WorkflowInstance | undefined,
): string[] {
  const out: string[] = [];
  for (const key of keys) {
    const instanceKey = parseInstanceKeyFromGlobalStateKey(key);
    if (!instanceKey) {
      continue;
    }
    const inst = loadByKey(instanceKey);
    if (!inst) {
      continue;
    }
    if (isRecoverableInstance(inst)) {
      out.push(instanceKey);
    }
  }
  return out;
}

export function getTaskSummariesFromGlobalStateEntries(
  entries: Array<{ key: string; value: unknown }>,
): WorkflowInstance[] {
  const list: WorkflowInstance[] = [];
  for (const { key, value } of entries) {
    if (!isWorkflowInstanceGlobalStateKey(key)) {
      continue;
    }
    if (value && typeof value === 'object' && 'definition' in (value as object)) {
      list.push(value as WorkflowInstance);
    }
  }
  return list;
}

export interface TaskListItem {
  instanceKey: string;
  title: string;
  taskType: string;
  status: string;
  recoverable: boolean;
  stageCount: number;
  completedStages: number;
  createdAt: string;
  userInput: string;
  taskWorkspacePath?: string;
}

export const COMPLETED_STAGE_STATUSES = new Set(['done', 'approved', 'skipped']);

export function countCompletedStages(inst: WorkflowInstance): number {
  const runtimes = Array.isArray(inst.stageRuntimes) ? inst.stageRuntimes : [];
  return runtimes.filter((rt) => COMPLETED_STAGE_STATUSES.has(rt.status)).length;
}

export function buildTaskListItem(instanceKey: string, inst: WorkflowInstance): TaskListItem {
  const stageRuntimes = Array.isArray(inst.stageRuntimes) ? inst.stageRuntimes : [];
  const completedStages = countCompletedStages(inst);
  return {
    instanceKey,
    title: inst.definition?.meta?.title ?? inst.definition?.id ?? instanceKey,
    taskType: inst.definition?.meta?.taskType ?? AUTO_TASK_TYPE,
    status: inst.status === 'failed' ? 'error' : (inst.status ?? 'idle'),
    recoverable: isRecoverableInstance(inst),
    stageCount: inst.definition?.stages?.length ?? stageRuntimes.length,
    completedStages,
    createdAt: inst.definition?.meta?.createdAt ?? inst.startedAt ?? '',
    userInput: inst.definition?.meta?.userInput ?? '',
    taskWorkspacePath: inst.definition?.meta?.taskWorkspacePath,
  };
}
