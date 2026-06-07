import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';

export interface SpawnWithTimeoutOptions {
  cwd: string;
  shell?: boolean;
  env?: NodeJS.ProcessEnv;
  timeoutMs: number;
  onStdoutChunk?: (text: string) => void;
  onStderrChunk?: (text: string) => void;
}

export interface SpawnWithTimeoutResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  signal: NodeJS.Signals | null;
}

export function spawnShellWithTimeout(
  command: string,
  opts: SpawnWithTimeoutOptions,
): Promise<SpawnWithTimeoutResult> {
  const child = spawn(command, {
    cwd: opts.cwd,
    shell: opts.shell ?? true,
    env: opts.env,
  });
  return collectChildWithTimeout(child, opts);
}

/**
 * 以 argv 数组直接执行(shell:false),用于需要精确传参、避免 shell 转义的场景
 * (如 `sandbox-exec -p <profile> /bin/sh -c <command>`)。
 */
export function spawnArgvWithTimeout(
  file: string,
  args: string[],
  opts: SpawnWithTimeoutOptions,
): Promise<SpawnWithTimeoutResult> {
  const child = spawn(file, args, {
    cwd: opts.cwd,
    shell: false,
    env: opts.env,
  });
  return collectChildWithTimeout(child, opts);
}

function collectChildWithTimeout(
  child: ChildProcessWithoutNullStreams,
  opts: SpawnWithTimeoutOptions,
): Promise<SpawnWithTimeoutResult> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, opts.timeoutMs);

    child.stdout.on('data', (buf: Buffer) => {
      const text = buf.toString();
      stdout += text;
      opts.onStdoutChunk?.(text);
    });
    child.stderr.on('data', (buf: Buffer) => {
      const text = buf.toString();
      stderr += text;
      opts.onStderrChunk?.(text);
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({
        exitCode: typeof code === 'number' ? code : 1,
        stdout,
        stderr,
        timedOut,
        signal: signal ?? null,
      });
    });
  });
}
