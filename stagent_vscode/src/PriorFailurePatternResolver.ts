import {
  resolveExperienceStorePath,
  WorkflowExperienceStore,
  type FailurePattern,
} from './WorkflowExperienceStore';
import { stageIdPrefixForExperience } from './StageIdPrefix';

export interface PriorFailurePatternOptions {
  taskType: string;
  stageId: string;
  workspaceRoot: string | undefined;
  enabled: boolean;
  warn?: (message: string) => void;
}

export function formatPriorFailurePattern(pattern: FailurePattern): string {
  return `${pattern.errorType}@${pattern.stageIdPattern} (${pattern.frequency}x)`;
}

/** 从经验库读取当前 stage 前缀的最高频历史失败模式（M17 运行时降权信号）。 */
export async function resolvePriorFailurePattern(
  opts: PriorFailurePatternOptions,
): Promise<string | undefined> {
  if (!opts.enabled || !opts.workspaceRoot?.trim()) {
    return undefined;
  }
  try {
    const storePath = resolveExperienceStorePath(opts.workspaceRoot.trim());
    const store = new WorkflowExperienceStore(storePath);
    const prefix = stageIdPrefixForExperience(opts.stageId);
    const patterns = await store.getFailurePatterns(opts.taskType, prefix);
    if (patterns.length === 0) {
      return undefined;
    }
    patterns.sort((a, b) => b.frequency - a.frequency);
    return formatPriorFailurePattern(patterns[0]!);
  } catch (e) {
    opts.warn?.(
      `prior_failure_pattern_resolve_failed stage=${opts.stageId} err=${e instanceof Error ? e.message : String(e)}`,
    );
    return undefined;
  }
}
