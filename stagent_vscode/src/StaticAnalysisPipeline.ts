import * as fs from 'fs';
import { DEFAULT_FS_READ_TIMEOUT_MS } from './FsAsync';
import { LOG_PREVIEW_MEDIUM } from './LogPreviewLimits';
import { spawnShellWithTimeout } from './process/ProcessRunner';
import { getMergedExecEnv } from './process/shellEnvironment';
import * as path from 'path';
import type { Stage } from './WorkflowDefinition';
import { isCodeRunnerTool, STAGE_TOOL_CODE_RUNNER } from './workflow/StageToolKinds';
import { TSC_OUTPUT_OUTPUT_KEY } from './WorkflowOutputKeys';
import { resolveExistingImportPath } from './ImportPathResolve';
import { extractRelativeImportSpecs } from './ImportExtract';
import { WORKSPACE_TSCONFIG_JSON } from './workspace/WorkspaceRootFilenames';

export type AnalysisCheck =
  | { type: 'typescript'; tsconfigPath: string }
  | { type: 'eslint'; configPath?: string; targetGlob: string }
  | { type: 'imports'; entryPoint: string }
  | { type: 'custom'; command: string };

export interface AnalysisResult {
  check: AnalysisCheck;
  passed: boolean;
  errors: string[];
  warnings: string[];
  durationMs: number;
  skipped?: boolean;
  skipReason?: string;
}

export type RunCommandFn = (
  command: string,
  cwd: string,
  timeoutMs: number,
) => Promise<{ exitCode: number; stdout: string; stderr: string }>;

const DEFAULT_TIMEOUT_MS = DEFAULT_FS_READ_TIMEOUT_MS;

const STATIC_ANALYSIS_MAX_ERRORS = 20;
const STATIC_ANALYSIS_MAX_WARNINGS = 10;

function runImportsCheck(entryPoint: string, workspaceRoot: string): {
  passed: boolean;
  errors: string[];
  warnings: string[];
} {
  const absEntry = path.isAbsolute(entryPoint)
    ? entryPoint
    : path.join(workspaceRoot, entryPoint);
  if (!fs.existsSync(absEntry)) {
    return { passed: false, errors: [`entry missing: ${entryPoint}`], warnings: [] };
  }
  const content = fs.readFileSync(absEntry, 'utf-8');
  const errors: string[] = [];
  for (const rel of extractRelativeImportSpecs(content)) {
    if (!resolveExistingImportPath(path.dirname(absEntry), rel)) {
      errors.push(`unresolved import "${rel}" in ${entryPoint}`);
    }
  }
  return {
    passed: errors.length === 0,
    errors: errors.slice(0, STATIC_ANALYSIS_MAX_ERRORS),
    warnings: [],
  };
}

async function defaultRunCommand(
  command: string,
  cwd: string,
  timeoutMs: number,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const result = await spawnShellWithTimeout(command, { cwd, timeoutMs, env: getMergedExecEnv() });
  if (result.timedOut) {
    throw new Error('static-analysis-timeout');
  }
  return { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr };
}

async function runSingleCheck(
  check: AnalysisCheck,
  workspaceRoot: string,
  timeoutMs: number,
  runCommand: RunCommandFn,
): Promise<AnalysisResult> {
  const started = Date.now();
  try {
    if (check.type === 'typescript') {
      const cmd = `npx tsc -p "${check.tsconfigPath}" --noEmit`;
      const result = await runCommand(cmd, workspaceRoot, timeoutMs);
      const combined = `${result.stdout}\n${result.stderr}`.trim();
      const errors = combined
        .split('\n')
        .filter((l) => l.includes('error TS'))
        .slice(0, STATIC_ANALYSIS_MAX_ERRORS);
      return {
        check,
        passed: result.exitCode === 0,
        errors,
        warnings: [],
        durationMs: Date.now() - started,
      };
    }
    if (check.type === 'eslint') {
      const cfg = check.configPath ? `--config "${check.configPath}"` : '';
      const cmd = `npx eslint ${cfg} "${check.targetGlob}"`;
      const result = await runCommand(cmd, workspaceRoot, timeoutMs);
      return {
        check,
        passed: result.exitCode === 0,
        errors: result.stderr.split('\n').filter(Boolean).slice(0, STATIC_ANALYSIS_MAX_ERRORS),
        warnings: result.stdout.split('\n').filter(Boolean).slice(0, STATIC_ANALYSIS_MAX_WARNINGS),
        durationMs: Date.now() - started,
      };
    }
    if (check.type === 'imports') {
      const result = runImportsCheck(check.entryPoint, workspaceRoot);
      return {
        check,
        passed: result.passed,
        errors: result.errors,
        warnings: result.warnings,
        durationMs: Date.now() - started,
        skipped: false,
      };
    }
    const result = await runCommand(check.command, workspaceRoot, timeoutMs);
    return {
      check,
      passed: result.exitCode === 0,
      errors: result.exitCode !== 0 ? [result.stderr.slice(0, LOG_PREVIEW_MEDIUM)] : [],
      warnings: [],
      durationMs: Date.now() - started,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      check,
      passed: false,
      errors: [msg],
      warnings: [],
      durationMs: Date.now() - started,
      skipped: msg.includes('ENOENT') || msg.includes('not found'),
      skipReason: msg,
    };
  }
}

export async function runStaticAnalysis(
  checks: AnalysisCheck[],
  workspaceRoot: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  runCommand: RunCommandFn = defaultRunCommand,
): Promise<AnalysisResult[]> {
  const results: AnalysisResult[] = [];
  for (const check of checks) {
    results.push(await runSingleCheck(check, workspaceRoot, timeoutMs, runCommand));
  }
  return results;
}

export function analysisResultsToWarningLines(results: AnalysisResult[]): string[] {
  return results
    .filter((r) => !r.passed && !r.skipped)
    .map((r) => `static-analysis:${r.check.type}:failed`);
}

/** 为 impl 阶段后追加可选 tsc 验证 stage 建议（不写入 workflow，仅 warnings / 文档）。 */
export function suggestVerificationStages(
  results: AnalysisResult[],
  existingStages: Stage[],
): Stage[] {
  const hasTscStage = existingStages.some(
    (s) => isCodeRunnerTool(s.tool) && /tsc/.test((s.toolConfig as { command?: string }).command ?? ''),
  );
  if (hasTscStage) {
    return [];
  }
  const tscFailed = results.some((r) => r.check.type === 'typescript' && !r.passed && !r.skipped);
  if (!tscFailed) {
    return [];
  }
  return [
    {
      id: 'stage_verify_tsc_suggested',
      title: '建议：TypeScript 类型检查（静态分析管道生成）',
      tool: STAGE_TOOL_CODE_RUNNER,
      toolConfig: {
        type: STAGE_TOOL_CODE_RUNNER,
        command: `npx tsc -p ${WORKSPACE_TSCONFIG_JSON} --noEmit`,
        captureOutput: true,
        pathBase: 'workspace',
      },
      input: { sources: [{ type: 'user-input', label: 'hint' }], mergeStrategy: 'concat' },
      outputs: [{ key: TSC_OUTPUT_OUTPUT_KEY, format: 'text' }],
      pauseAfter: false,
    },
  ];
}

function defaultTypeScriptCheck(_workspaceRoot: string): AnalysisCheck | undefined {
  return { type: 'typescript', tsconfigPath: WORKSPACE_TSCONFIG_JSON };
}

/** 常见 extension 入口；不存在时跳过 imports check。 */
function defaultImportsCheck(workspaceRoot: string): AnalysisCheck | undefined {
  for (const candidate of ['src/extension.ts', 'src/index.ts', 'index.ts']) {
    if (fs.existsSync(path.join(workspaceRoot, candidate))) {
      return { type: 'imports', entryPoint: candidate };
    }
  }
  return undefined;
}

export function buildDefaultWorkspaceChecks(workspaceRoot: string): AnalysisCheck[] {
  const checks: AnalysisCheck[] = [];
  const tsc = defaultTypeScriptCheck(workspaceRoot);
  if (tsc && fs.existsSync(path.join(workspaceRoot, WORKSPACE_TSCONFIG_JSON))) {
    checks.push(tsc);
  }
  const imports = defaultImportsCheck(workspaceRoot);
  if (imports) {
    checks.push(imports);
  }
  return checks;
}
