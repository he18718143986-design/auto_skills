import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type {
  Artifact,
  ArtifactState,
  PersistedFileTrackInput,
  RollbackResult,
} from './ArtifactTypes';
import { DEFAULT_FS_READ_TIMEOUT_MS, pathExists, readTextFile } from './FsAsync';

export type {
  Artifact,
  ArtifactState,
  ArtifactStateHistoryEntry,
  PersistedFileTrackInput,
  RollbackResult,
} from './ArtifactTypes';

function checksumContent(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

function pushHistory(artifact: Artifact, state: ArtifactState, reason?: string): void {
  const at = new Date().toISOString();
  artifact.state = state;
  artifact.stateHistory = [...(artifact.stateHistory ?? []), { state, at, reason }];
}

function buildPersistedArtifact(input: PersistedFileTrackInput): Artifact {
  const now = new Date().toISOString();
  return {
    stageId: input.stageId,
    outputKey: input.outputKey,
    filePath: path.normalize(input.filePath),
    state: 'persisted',
    checksum: checksumContent(input.content),
    createdAt: now,
    existedBefore: input.existedBefore,
    priorContent: input.existedBefore ? input.priorContent : undefined,
    stateHistory: [{ state: 'persisted', at: now, reason: 'file-write' }],
  };
}

/** 同路径覆盖冲突回调：另一个阶段曾写入同一文件，本次写入会覆盖之。 */
export type SamePathConflictHandler = (info: {
  filePath: string;
  incomingStageId: string;
  priorStageId: string;
}) => void;

/**
 * 注册一次落盘；同 stageId+outputKey 的旧条目标记为 superseded。
 * 若注册表已有「其他阶段」写入同一规范化路径的活跃产物，触发 onSamePathConflict
 * （供上层 degraded 告警）——并发/串行多阶段写同一文件属 last-writer-wins，易静默互覆盖。
 */
export function registerPersistedArtifact(
  registry: Artifact[],
  input: PersistedFileTrackInput,
  onSamePathConflict?: SamePathConflictHandler,
): Artifact {
  const normalizedPath = path.normalize(input.filePath);
  for (const existing of registry) {
    if (
      existing.stageId === input.stageId &&
      existing.outputKey === input.outputKey &&
      existing.state !== 'rolled-back' &&
      existing.state !== 'superseded'
    ) {
      pushHistory(existing, 'superseded', `replaced-by-${input.outputKey}`);
    }
  }
  if (onSamePathConflict) {
    const conflict = registry.find(
      (a) =>
        a.filePath === normalizedPath &&
        a.stageId !== input.stageId &&
        a.state !== 'rolled-back' &&
        a.state !== 'superseded',
    );
    if (conflict) {
      onSamePathConflict({
        filePath: normalizedPath,
        incomingStageId: input.stageId,
        priorStageId: conflict.stageId,
      });
    }
  }
  const artifact = buildPersistedArtifact(input);
  registry.push(artifact);
  return artifact;
}

const ROLLBACK_ELIGIBLE: ReadonlySet<ArtifactState> = new Set([
  'persisted',
  'verified',
  'approved',
  'superseded',
]);

function pickArtifactsForPaths(artifacts: Artifact[]): Artifact[] {
  const byPath = new Map<string, Artifact>();
  for (const art of artifacts) {
    const prev = byPath.get(art.filePath);
    if (!prev || art.createdAt >= prev.createdAt) {
      byPath.set(art.filePath, art);
    }
  }
  return [...byPath.values()];
}

export function selectArtifactsForStageIds(registry: Artifact[], resetStageIds: string[]): Artifact[] {
  const ids = new Set(resetStageIds);
  const candidates = registry.filter(
    (a) => ids.has(a.stageId) && ROLLBACK_ELIGIBLE.has(a.state),
  );
  return pickArtifactsForPaths(candidates);
}

function rollbackArtifactOnDisk(artifact: Artifact): { ok: boolean; error?: string } {
  if (artifact.state === 'rolled-back') {
    return { ok: true };
  }
  try {
    if (artifact.existedBefore) {
      fs.mkdirSync(path.dirname(artifact.filePath), { recursive: true });
      fs.writeFileSync(artifact.filePath, artifact.priorContent ?? '', 'utf-8');
    } else if (fs.existsSync(artifact.filePath)) {
      fs.unlinkSync(artifact.filePath);
    }
    pushHistory(artifact, 'rolled-back', 'decision-retry');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 同步回滚（磁盘操作本就是同步的）；供失败中止路径在 try/catch 内即时清理。 */
export function rollbackArtifactsSync(artifacts: Artifact[]): RollbackResult {
  const rolledBack: string[] = [];
  const failed: Array<{ filePath: string; error: string }> = [];
  for (const art of artifacts) {
    const result = rollbackArtifactOnDisk(art);
    if (result.ok) {
      rolledBack.push(art.filePath);
    } else {
      failed.push({ filePath: art.filePath, error: result.error ?? 'unknown' });
    }
  }
  return { ok: failed.length === 0, rolledBack, failed };
}

export async function rollbackArtifacts(artifacts: Artifact[]): Promise<RollbackResult> {
  return rollbackArtifactsSync(artifacts);
}

/** 同步回滚指定阶段的落盘产物（失败中止路径用，best-effort）。 */
export function rollbackArtifactsForStageSync(registry: Artifact[], stageId: string): RollbackResult {
  const artifacts = selectArtifactsForStageIds(registry, [stageId]);
  if (artifacts.length === 0) {
    return { ok: true, rolledBack: [], failed: [] };
  }
  return rollbackArtifactsSync(artifacts);
}

/**
 * 决策重试时：与 {@link listDecisionRetryResetStageIds} 对齐，选取需回滚的落盘产物。
 */
export class ArtifactLifecycleManager {
  constructor(private readonly registry: Artifact[]) {}

  trackArtifact(artifact: Artifact): void {
    this.registry.push(artifact);
  }

  trackPersistedFile(input: PersistedFileTrackInput, onSamePathConflict?: SamePathConflictHandler): Artifact {
    return registerPersistedArtifact(this.registry, input, onSamePathConflict);
  }

  /** 回滚单个阶段的落盘产物（非决策 retry / onError=fail 用）。 */
  async rollbackArtifactsForStage(stageId: string): Promise<RollbackResult> {
    const artifacts = selectArtifactsForStageIds(this.registry, [stageId]);
    if (artifacts.length === 0) {
      return { ok: true, rolledBack: [], failed: [] };
    }
    return rollbackArtifacts(artifacts);
  }

  transition(stageId: string, outputKey: string, newState: ArtifactState, reason?: string): void {
    const art = [...this.registry]
      .reverse()
      .find((a) => a.stageId === stageId && a.outputKey === outputKey && a.state !== 'rolled-back');
    if (art) {
      pushHistory(art, newState, reason);
    }
  }

  getArtifactsForStageIds(stageIds: readonly string[]): Artifact[] {
    return selectArtifactsForStageIds(this.registry, [...stageIds]);
  }

  async rollbackArtifacts(artifacts: Artifact[]): Promise<RollbackResult> {
    return rollbackArtifacts(artifacts);
  }
}

/** 阶段暂停审核时：将该阶段 persisted 产物推进为 verified。 */
export function markArtifactsVerifiedForStage(registry: Artifact[], stageId: string): void {
  const mgr = new ArtifactLifecycleManager(registry);
  for (const art of registry) {
    if (art.stageId === stageId && art.state === 'persisted') {
      mgr.transition(stageId, art.outputKey, 'verified', 'pause-review');
    }
  }
}

/** 人工批准阶段时：将该阶段 persisted/verified 产物推进为 approved。 */
export function markArtifactsApprovedForStage(registry: Artifact[], stageId: string): void {
  const mgr = new ArtifactLifecycleManager(registry);
  for (const art of registry) {
    if (art.stageId === stageId && (art.state === 'persisted' || art.state === 'verified')) {
      mgr.transition(stageId, art.outputKey, 'approved', 'human-approve');
    }
  }
}

export function readPriorFileContent(filePath: string): { existedBefore: boolean; priorContent?: string } {
  if (!fs.existsSync(filePath)) {
    return { existedBefore: false };
  }
  return { existedBefore: true, priorContent: fs.readFileSync(filePath, 'utf-8') };
}

/** #7：异步读取写盘前内容（热路径 file-write / writeOutputToFile 使用）。 */
export async function readPriorFileContentAsync(
  filePath: string,
): Promise<{ existedBefore: boolean; priorContent?: string }> {
  if (!(await pathExists(filePath))) {
    return { existedBefore: false };
  }
  return {
    existedBefore: true,
    priorContent: await readTextFile(filePath, { timeoutMs: DEFAULT_FS_READ_TIMEOUT_MS }),
  };
}
