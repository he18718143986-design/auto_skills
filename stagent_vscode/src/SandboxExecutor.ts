import * as os from 'os';
import * as fs from 'fs';
import { DEFAULT_CODE_RUNNER_TIMEOUT_SEC } from './CodeRunnerInvokeHelpers';
import {
  ERROR_TYPE_CODE_RUNNER_TIMEOUT,
  ERROR_TYPE_SANDBOX_MEMORY_EXCEEDED,
  ERROR_TYPE_SANDBOX_NETWORK_BLOCKED,
} from './errors/stageErrorBuilders';
import {
  spawnArgvWithTimeout,
  spawnShellWithTimeout,
  type SpawnWithTimeoutOptions,
  type SpawnWithTimeoutResult,
} from './process/ProcessRunner';
import { getMergedExecEnv } from './process/shellEnvironment';
import { buildMacosSandboxProfile } from './process/MacosSandboxProfile';
import {
  assertSandboxEnforcementAvailable,
  resolveSandboxCapability,
  type SandboxCapabilityState,
} from './sandbox/SandboxCapabilityMatrix';

type SandboxErrorType =
  | typeof ERROR_TYPE_SANDBOX_NETWORK_BLOCKED
  | typeof ERROR_TYPE_SANDBOX_MEMORY_EXCEEDED
  | typeof ERROR_TYPE_CODE_RUNNER_TIMEOUT;

export interface SandboxOptions {
  memoryLimitMb?: number;
  timeoutSeconds?: number;
  networkAllowed: boolean;
  env?: Record<string, string>;
  /**
   * sandbox.enabled 路径须为 true：无内核级隔离时 fail-closed，拒绝执行。
   * 直接调用 runInSandbox 的测试/工具可省略（默认 false，允许软约束降级）。
   */
  requireEnforced?: boolean;
  /** 实时输出回调（与非沙箱路径一致，避免开启沙箱后丢失流式日志）。 */
  onStdoutChunk?: (text: string) => void;
  onStderrChunk?: (text: string) => void;
  /** 当沙箱静默降级为无隔离执行时回调（可观测性，避免"看起来在沙箱里"的误判）。 */
  onDegraded?: (message: string) => void;
}

export type { SandboxCapabilityState };
export { resolveSandboxCapability, assertSandboxEnforcementAvailable };

export interface SandboxResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  memoryExceeded: boolean;
  blockedNetworkAttempts: number;
}

export class SandboxExecutionError extends Error {
  constructor(
    message: string,
    readonly errorType: SandboxErrorType,
  ) {
    super(message);
    this.name = 'SandboxExecutionError';
  }
}

import { SANDBOX_DEFAULT_MEMORY_MB } from './TimeConstants';

const DEFAULT_MEMORY_MB = SANDBOX_DEFAULT_MEMORY_MB;
const DEFAULT_TIMEOUT_SEC = DEFAULT_CODE_RUNNER_TIMEOUT_SEC;

function buildSandboxEnv(options: SandboxOptions): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...getMergedExecEnv(), ...options.env };
  if (!options.networkAllowed) {
    env.HTTP_PROXY = 'http://127.0.0.1:9';
    env.HTTPS_PROXY = 'http://127.0.0.1:9';
    env.NO_PROXY = 'localhost,127.0.0.1';
    env.STAGENT_SANDBOX_NETWORK = 'blocked';
  }
  return env;
}

function memoryLimitPrefix(memoryLimitMb: number): string {
  if (process.platform === 'win32') {
    return '';
  }
  const kb = Math.max(1, memoryLimitMb) * 1024;
  return `ulimit -v ${kb} 2>/dev/null; `;
}

function safeRealpath(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
}

function isEnoent(e: unknown): boolean {
  return (
    typeof e === 'object' && e !== null && (e as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

/** darwin 下是否走 sandbox-exec 真隔离（其余平台无内核级隔离）。 */
export function macosSandboxAvailable(): boolean {
  return process.platform === 'darwin';
}

let warnedNoKernelIsolation = false;

/** 非 darwin 平台无内核级隔离：进程级仅做一次告警，避免每条命令刷屏。 */
function warnNoKernelIsolationOnce(onDegraded?: (message: string) => void): void {
  if (warnedNoKernelIsolation) {
    return;
  }
  warnedNoKernelIsolation = true;
  onDegraded?.(
    `当前平台（${process.platform}）无内核级沙箱隔离，命令以软约束（ulimit + 代理环境变量）方式执行，非安全边界，请勿运行不可信代码。`,
  );
}

/**
 * 执行命令：darwin 上经 `sandbox-exec` 内核级隔离（写仅限工作目录/临时目录、可选断网）；
 * sandbox-exec 缺失或非 darwin 时降级为普通 shell（仅环境变量软网络阻断，非安全边界）。
 */
async function runSandboxedCommand(
  inner: string,
  cwd: string,
  options: SandboxOptions,
  timeoutMs: number,
): Promise<SpawnWithTimeoutResult> {
  const base: SpawnWithTimeoutOptions = {
    cwd,
    env: buildSandboxEnv(options),
    timeoutMs,
    onStdoutChunk: options.onStdoutChunk,
    onStderrChunk: options.onStderrChunk,
  };
  if (macosSandboxAvailable()) {
    const writeRoots = Array.from(
      new Set([safeRealpath(cwd), safeRealpath(os.tmpdir())].filter(Boolean)),
    );
    const profile = buildMacosSandboxProfile({
      writeRoots,
      networkAllowed: options.networkAllowed,
    });
    try {
      return await spawnArgvWithTimeout(
        'sandbox-exec',
        ['-p', profile, '/bin/sh', '-c', inner],
        base,
      );
    } catch (e) {
      if (!isEnoent(e)) {
        throw e;
      }
      if (options.requireEnforced) {
        assertSandboxEnforcementAvailable();
      }
      // sandbox-exec 不可用：降级为无隔离 shell（明确告警，避免误以为仍在沙箱中）。
      options.onDegraded?.('sandbox-exec 不可用（ENOENT），本次命令已在无沙箱隔离下执行。');
    }
  } else {
    if (options.requireEnforced) {
      assertSandboxEnforcementAvailable();
    }
    warnNoKernelIsolationOnce(options.onDegraded);
  }
  return spawnShellWithTimeout(inner, base);
}

/**
 * 实验性 code-runner 执行包装；默认关闭，由 `stagent.sandbox.enabled` 控制。
 *
 * 隔离能力分平台：
 *   - **macOS**：经 `sandbox-exec` 做内核级写隔离（写仅限工作目录 + 临时目录，
 *     `rm -rf ~` / 写 `~/.ssh` 等会被拒）+ 真网络封锁（`networkAllowed=false` 时 deny network*）；
 *   - **Linux / win32**：暂无内核级隔离，仅 `ulimit` 资源约束 + *_PROXY 环境变量软网络阻断
 *     （子进程可绕过，**不是安全边界**，勿运行不可信代码；Linux bwrap、容器为后续路线）。
 * 网络放行（`networkAllowed`）由调用方按命令解析
 * （`CodeRunnerInvokeHelpers.resolveSandboxNetworkAllowed`：npm/pip 等安装命令自动放行）。
 */
export async function runInSandbox(
  command: string,
  cwd: string,
  options: SandboxOptions,
): Promise<SandboxResult> {
  if (options.requireEnforced && !resolveSandboxCapability().sandboxEnforced) {
    assertSandboxEnforcementAvailable();
  }
  const timeoutMs = (options.timeoutSeconds ?? DEFAULT_TIMEOUT_SEC) * 1000;
  const memoryMb = options.memoryLimitMb ?? DEFAULT_MEMORY_MB;
  const wrapped = `${memoryLimitPrefix(memoryMb)}${command}`;

  const result = await runSandboxedCommand(wrapped, cwd, options, timeoutMs);
  const memoryExceeded =
    !result.timedOut &&
    (result.signal === 'SIGKILL' ||
      /Cannot allocate memory|ENOMEM|Killed/i.test(result.stderr));
  if (result.timedOut) {
    throw new SandboxExecutionError('sandbox execution timed out', ERROR_TYPE_CODE_RUNNER_TIMEOUT);
  }
  if (memoryExceeded) {
    throw new SandboxExecutionError('sandbox memory limit exceeded', ERROR_TYPE_SANDBOX_MEMORY_EXCEEDED);
  }
  const blockedNetworkAttempts = options.networkAllowed ? 0 : countNetworkAttempts(result.stderr);
  // 网络被阻断且命令因此失败时，给出明确错误类型（而非泛化的非零退出码）。
  if (blockedNetworkAttempts > 0 && result.exitCode !== 0) {
    throw new SandboxExecutionError(
      `sandbox blocked network access (${blockedNetworkAttempts} attempt(s))`,
      ERROR_TYPE_SANDBOX_NETWORK_BLOCKED,
    );
  }
  return {
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    timedOut: false,
    memoryExceeded: false,
    blockedNetworkAttempts,
  };
}

function countNetworkAttempts(stderr: string): number {
  const hints = [/ECONNREFUSED/i, /network.*blocked/i, /getaddrinfo ENOTFOUND/i];
  return hints.reduce((n, re) => n + (re.test(stderr) ? 1 : 0), 0);
}

export function mapSandboxError(error: unknown): SandboxErrorType | undefined {
  if (error instanceof SandboxExecutionError) {
    return error.errorType;
  }
  if (error instanceof Error && error.message.includes(ERROR_TYPE_CODE_RUNNER_TIMEOUT)) {
    return ERROR_TYPE_CODE_RUNNER_TIMEOUT;
  }
  return undefined;
}
