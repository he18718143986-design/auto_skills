import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { ErrorType, StageStatus, WorkflowInstance } from './WorkflowDefinition';
import { CONFIDENCE_OUTPUT_KEY } from './WorkflowOutputKeys';
import {
  atomicWriteTextFile,
  DEFAULT_FS_READ_TIMEOUT_MS,
  ensureDir,
  readTextFileIfExists,
} from './FsAsync';
import {
  withAsyncFileLock as withExperienceStoreLockAsync,
  withSyncFileLock as withExperienceStoreLock,
} from './jsonl/JsonlAtomicAppend';
import { experiencesPath, EXPERIENCES_FILENAME } from './paths/StagentPaths';

export { EXPERIENCES_FILENAME } from './paths/StagentPaths';
export { withExperienceStoreLock, withExperienceStoreLockAsync };

export const DEFAULT_MAX_EXPERIENCE_ENTRIES = 500;

export type WorkflowCompletionStatus = 'completed' | 'failed' | 'abandoned';

export interface StageOutcomeRecord {
  stageId: string;
  tool?: string;
  retryCount?: number;
  finalStatus?: StageStatus;
  errorType?: ErrorType;
  confidenceScore?: number;
  durationMs?: number;
}

export interface WorkflowExperience {
  id: string;
  timestamp: string;
  taskType?: string;
  workflowId?: string;
  instanceKey?: string;
  userInputHash?: string;
  stageCount?: number;
  completionStatus?: WorkflowCompletionStatus;
  stageOutcomes?: StageOutcomeRecord[];
  totalDurationMs?: number;
  humanInterventions?: number;
  promptVersions?: Record<string, string>;
  /** 失败时摘要（不含 userInput 原文） */
  failureStageId?: string;
  failureErrorType?: ErrorType;
}

/** M17 FailurePatternAnalyzer 使用的轻量结构；M15.3 仅做基础聚合 */
export interface FailurePattern {
  patternId: string;
  frequency: number;
  stageIdPattern: string;
  errorType: ErrorType;
  commonContext: string;
}

export function resolveExperienceStorePath(workspaceRoot: string): string {
  return experiencesPath(workspaceRoot, EXPERIENCES_FILENAME);
}

export function hashUserInput(userInput: string): string {
  return crypto.createHash('sha256').update(userInput ?? '', 'utf8').digest('hex');
}

function parseDurationMs(startedAt?: string, completedAt?: string): number | undefined {
  if (!startedAt || !completedAt) {
    return undefined;
  }
  const ms = Date.parse(completedAt) - Date.parse(startedAt);
  return Number.isFinite(ms) && ms >= 0 ? ms : undefined;
}

function readConfidenceScore(runtimeOutputs: Record<string, unknown>): number | undefined {
  const raw = runtimeOutputs[CONFIDENCE_OUTPUT_KEY];
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const score = (raw as { score?: unknown }).score;
  return typeof score === 'number' && Number.isFinite(score) ? score : undefined;
}

function buildStageOutcomeRecords(instance: WorkflowInstance): StageOutcomeRecord[] {
  const { definition, stageRuntimes } = instance;
  return definition.stages.map((stage, i) => {
    const rt = stageRuntimes[i];
    if (!rt) {
      return { stageId: stage.id, tool: stage.tool };
    }
    return {
      stageId: stage.id,
      tool: stage.tool,
      retryCount: rt.retryCount,
      finalStatus: rt.status,
      confidenceScore: readConfidenceScore(rt.outputs),
      durationMs: parseDurationMs(rt.startedAt, rt.completedAt),
    };
  });
}

function countHumanInterventions(instance: WorkflowInstance): number {
  let n = 0;
  for (let i = 0; i < instance.definition.stages.length; i++) {
    const stage = instance.definition.stages[i];
    const rt = instance.stageRuntimes[i];
    if (!rt) {
      continue;
    }
    n += rt.retryCount ?? 0;
    if (stage.isDecisionStage && rt.status === 'done' && rt.approvedDecisionRecord) {
      n += 1;
    }
    const qa = rt.questionAnswers ?? rt.questionBeforeAnswers;
    if (qa && Object.keys(qa).length > 0) {
      n += 1;
    }
  }
  return n;
}

export interface BuildWorkflowExperienceOptions {
  completionStatus: WorkflowCompletionStatus;
  instanceKey?: string;
  failureStageId?: string;
  failureErrorType?: ErrorType;
  /** 覆盖自动生成 id（测试用） */
  id?: string;
  /** 覆盖 timestamp（测试用） */
  timestamp?: string;
}

export function buildWorkflowExperience(
  instance: WorkflowInstance,
  options: BuildWorkflowExperienceOptions,
): WorkflowExperience {
  const { definition } = instance;
  const userInput = definition.meta.userInput ?? '';
  const totalDurationMs = parseDurationMs(instance.startedAt, instance.completedAt);

  return {
    id: options.id ?? crypto.randomUUID(),
    timestamp: options.timestamp ?? new Date().toISOString(),
    taskType: definition.meta.taskType,
    workflowId: definition.id,
    instanceKey: options.instanceKey,
    userInputHash: hashUserInput(userInput),
    stageCount: definition.stages.length,
    completionStatus: options.completionStatus,
    stageOutcomes: buildStageOutcomeRecords(instance),
    totalDurationMs,
    humanInterventions: countHumanInterventions(instance),
    promptVersions: {},
    failureStageId: options.failureStageId,
    failureErrorType: options.failureErrorType,
  };
}

function matchesFilter(entry: WorkflowExperience, filter: Partial<WorkflowExperience>): boolean {
  for (const [key, expected] of Object.entries(filter)) {
    if (expected === undefined) {
      continue;
    }
    const actual = entry[key as keyof WorkflowExperience];
    if (actual !== expected) {
      return false;
    }
  }
  return true;
}

function parseJsonlLines(raw: string): WorkflowExperience[] {
  const entries: WorkflowExperience[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      entries.push(JSON.parse(trimmed) as WorkflowExperience);
    } catch {
      // 跳过损坏行
    }
  }
  return entries;
}

async function readJsonlFileAsync(storePath: string): Promise<WorkflowExperience[]> {
  const raw = await readTextFileIfExists(storePath, { timeoutMs: DEFAULT_FS_READ_TIMEOUT_MS });
  if (raw === undefined) {
    return [];
  }
  return parseJsonlLines(raw);
}

function readJsonlFile(storePath: string): WorkflowExperience[] {
  if (!fs.existsSync(storePath)) {
    return [];
  }
  return parseJsonlLines(fs.readFileSync(storePath, 'utf-8'));
}

async function writeJsonlFileAsync(storePath: string, entries: WorkflowExperience[]): Promise<void> {
  await ensureDir(path.dirname(storePath));
  const body = entries.length > 0 ? `${entries.map((e) => JSON.stringify(e)).join('\n')}\n` : '';
  await atomicWriteTextFile(storePath, body);
}

/**
 * #12：原子写——先写临时文件再 rename 覆盖（同 fs 上 rename 原子），
 * 使并发读取者永远看不到「写一半」的截断内容，避免 jsonl 损坏。
 */
function writeJsonlFile(storePath: string, entries: WorkflowExperience[]): void {
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  const body = entries.length > 0 ? `${entries.map((e) => JSON.stringify(e)).join('\n')}\n` : '';
  const tmpPath = `${storePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    fs.writeFileSync(tmpPath, body, 'utf-8');
    fs.renameSync(tmpPath, storePath);
  } catch (e) {
    try {
      fs.rmSync(tmpPath, { force: true });
    } catch {
      /* 清理 best-effort */
    }
    throw e;
  }
}

function trimToMaxEntries(entries: WorkflowExperience[], maxEntries: number): WorkflowExperience[] {
  if (maxEntries <= 0 || entries.length <= maxEntries) {
    return entries;
  }
  return entries.slice(entries.length - maxEntries);
}

/**
 * 工作流执行经验持久化（JSONL）。`storePath` 由调用方注入，本模块不读取 vscode.workspace。
 */
export class WorkflowExperienceStore {
  constructor(
    private readonly storePath: string,
    private readonly maxEntries: number = DEFAULT_MAX_EXPERIENCE_ENTRIES,
  ) {}

  /** 读取全部条目（FIFO 顺序：旧 → 新） */
  readAll(): WorkflowExperience[] {
    return readJsonlFile(this.storePath);
  }

  async readAllAsync(): Promise<WorkflowExperience[]> {
    return readJsonlFileAsync(this.storePath);
  }

  appendSync(experience: WorkflowExperience): void {
    withExperienceStoreLock(this.storePath, () => {
      const entries = this.readAll();
      entries.push(experience);
      writeJsonlFile(this.storePath, trimToMaxEntries(entries, this.maxEntries));
    });
  }

  async append(experience: WorkflowExperience): Promise<void> {
    await withExperienceStoreLockAsync(this.storePath, async () => {
      const entries = await readJsonlFileAsync(this.storePath);
      entries.push(experience);
      await writeJsonlFileAsync(this.storePath, trimToMaxEntries(entries, this.maxEntries));
    });
  }

  async query(filter: Partial<WorkflowExperience>): Promise<WorkflowExperience[]> {
    const all = await this.readAllAsync();
    return all.filter((entry) => matchesFilter(entry, filter));
  }

  async getSuccessfulWorkflows(taskType: string, limit: number): Promise<WorkflowExperience[]> {
    const matched = await this.query({ taskType, completionStatus: 'completed' });
    if (limit <= 0) {
      return [];
    }
    return matched.slice(-limit);
  }

  async getFailurePatterns(taskType: string, stageIdPrefix: string): Promise<FailurePattern[]> {
    const failed = (await this.query({ taskType, completionStatus: 'failed' })).filter(
      (e) => e.failureStageId?.startsWith(stageIdPrefix),
    );
    const buckets = new Map<string, { count: number; errorType: ErrorType; stageId: string }>();
    for (const exp of failed) {
      const stageId = exp.failureStageId ?? 'unknown';
      const errorType = exp.failureErrorType ?? 'unknown';
      const key = `${stageId}::${errorType}`;
      const prev = buckets.get(key);
      if (prev) {
        prev.count += 1;
      } else {
        buckets.set(key, { count: 1, errorType, stageId });
      }
    }
    return [...buckets.entries()].map(([key, v]) => ({
      patternId: key,
      frequency: v.count,
      stageIdPattern: stageIdPrefix,
      errorType: v.errorType,
      commonContext: `stage=${v.stageId}`,
    }));
  }
}

export async function appendWorkflowExperienceAsync(
  storePath: string,
  experience: WorkflowExperience,
  maxEntries: number = DEFAULT_MAX_EXPERIENCE_ENTRIES,
): Promise<void> {
  const store = new WorkflowExperienceStore(storePath, maxEntries);
  await store.append(experience);
}

export function appendWorkflowExperience(
  storePath: string,
  experience: WorkflowExperience,
  maxEntries: number = DEFAULT_MAX_EXPERIENCE_ENTRIES,
  warn?: (message: string) => void,
): void {
  void appendWorkflowExperienceAsync(storePath, experience, maxEntries).catch((e) => {
    warn?.(`experience append failed: ${e instanceof Error ? e.message : String(e)}`);
  });
}
