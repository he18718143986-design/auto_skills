import * as vscode from 'vscode';
import { getMergedExecEnv } from '../process/shellEnvironment';

/** 使用 VS Code 配置的默认 shell，合并为 code-runner 子进程环境。 */
export function resolveVscodeMergedExecEnv(): NodeJS.ProcessEnv {
  const shell = vscode.env.shell?.trim() || undefined;
  return getMergedExecEnv(shell);
}
