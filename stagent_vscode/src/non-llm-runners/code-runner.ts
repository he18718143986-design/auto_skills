import type { CodeRunnerConfig } from '../WorkflowDefinition';
import {
  collectAllCodeRunnerLintIssues,
  formatCodeRunnerCommandIssue,
  isDangerousCommandIssue,
} from '../CodeRunnerCommandLint';
import { readDangerousCommandLintMode } from '../StagentSettings';
import { collectConfigContractIssuesOnDisk } from '../ConfigContractLint';
import { invariantViolation, toolExecutionFailed } from '../ErrorTypeUtils';
import { CODE_RUNNER_EXIT_OUTPUT_KEY } from '../WorkflowOutputKeys';
import type { NonLlmToolExecutionParams } from '../WorkflowExecutorTypes';

export async function runCodeRunnerTool(params: NonLlmToolExecutionParams): Promise<boolean> {
  const { stage, runtime, outKey, instance, instanceKey, resolveOutputPath, runCodeRunner, stageIndex } = params;
  const cfg = stage.toolConfig as CodeRunnerConfig;
  if (!cfg.command?.trim()) {
    throw invariantViolation(`code-runner missing command at ${stage.id}`);
  }
  const issues = collectAllCodeRunnerLintIssues(String(cfg.command), instance.definition, stageIndex);
  const dangerousMode = readDangerousCommandLintMode();
  const blocking = issues.filter(
    (i) => !isDangerousCommandIssue(i) || dangerousMode === 'hard',
  );
  if (dangerousMode === 'warn') {
    for (const i of issues.filter(isDangerousCommandIssue)) {
      params.warn?.(formatCodeRunnerCommandIssue(stage.id, i));
    }
  }
  if (blocking.length > 0) {
    throw invariantViolation(formatCodeRunnerCommandIssue(stage.id, blocking[0]));
  }
  const contractWorkspaceDir = resolveOutputPath(instanceKey, cfg.workingDir?.trim() || '.', cfg.pathBase ?? 'workspace');
  const contractIssues = collectConfigContractIssuesOnDisk(String(cfg.command), contractWorkspaceDir);
  if (contractIssues.length > 0) {
    throw invariantViolation(contractIssues[0].message);
  }
  const result = await runCodeRunner(cfg, instanceKey, stage.id);
  runtime.outputs[CODE_RUNNER_EXIT_OUTPUT_KEY] = result.exitCode;
  runtime.outputs.stdout = result.stdout;
  runtime.outputs.stderr = result.stderr;
  runtime.outputs[outKey] = cfg.captureOutput
    ? [result.stdout, result.stderr].filter(Boolean).join('\n')
    : `exitCode=${result.exitCode}`;
  if (result.exitCode !== 0) {
    throw toolExecutionFailed(`code-runner exitCode=${result.exitCode}`);
  }
  return true;
}
