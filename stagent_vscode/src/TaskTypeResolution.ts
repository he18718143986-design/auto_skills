/** UI / 消息协议：由模型在 generateWorkflow 同次调用中决定 meta.taskType */
export const AUTO_TASK_TYPE = 'auto';

export const KNOWN_TASK_TYPES = [
  'software',
  'refactor',
  'debug',
  'prototype',
  'document',
  'improve-architecture',
  'other',
] as const;

export type KnownTaskType = (typeof KNOWN_TASK_TYPES)[number];

const KNOWN_SET = new Set<string>(KNOWN_TASK_TYPES);

export function isAutoTaskType(taskType: string | undefined): boolean {
  const t = taskType?.trim().toLowerCase();
  return !t || t === AUTO_TASK_TYPE;
}

export function isKnownTaskType(taskType: string | undefined): taskType is KnownTaskType {
  return !!taskType && KNOWN_SET.has(taskType.trim().toLowerCase());
}

/** 非 auto 时返回 trim 后的显式类型；auto/空 返回 undefined */
function normalizeTaskTypeOverride(taskType: string | undefined): KnownTaskType | undefined {
  if (isAutoTaskType(taskType)) {
    return undefined;
  }
  const t = taskType!.trim().toLowerCase();
  if (KNOWN_SET.has(t)) {
    return t as KnownTaskType;
  }
  return 'other';
}

/**
 * 生成后有效 taskType：显式 UI 覆盖优先；否则采用模型 meta.taskType；再否则 other（避免误走 software 磁盘管线）。
 */
export function resolveGeneratedTaskType(
  metaTaskType: string | undefined,
  uiTaskType: string | undefined,
): KnownTaskType {
  const override = normalizeTaskTypeOverride(uiTaskType);
  if (override) {
    return override;
  }
  const fromMeta = metaTaskType?.trim().toLowerCase();
  if (fromMeta && KNOWN_SET.has(fromMeta)) {
    return fromMeta as KnownTaskType;
  }
  return 'other';
}

export function buildTaskTypeOverrideWarning(
  uiTaskType: string | undefined,
  modelTaskType: string | undefined,
  effectiveType: KnownTaskType,
): string | undefined {
  const override = normalizeTaskTypeOverride(uiTaskType);
  if (!override) {
    return undefined;
  }
  const model = modelTaskType?.trim().toLowerCase();
  if (!model || model === override) {
    return undefined;
  }
  return `taskType:ui-override:${override}:model-suggested:${model}:effective:${effectiveType}`;
}
