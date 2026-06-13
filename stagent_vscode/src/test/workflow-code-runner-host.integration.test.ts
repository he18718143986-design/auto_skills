import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CodeRunnerConfig } from '../WorkflowDefinition';
import { resolveCodeRunnerCwd } from '../WorkflowCodeRunnerHost';

describe('WorkflowCodeRunnerHost integration', () => {
  const deps = {
    ensureTaskDir: () => '/instance/task',
    getWorkspaceRootAbsolute: () => '/ws',
    safeJoinUnderWorkspaceRoot: (r: string, rel: string) => `${r}/${rel}`,
    resolveTaskFilePath: (_k: string, fp: string) => `/instance/task/${fp}`,
    postStreamChunk: () => {},
    warn: () => {},
    sandboxEnabled: false,
    sandboxVerificationOnly: false,
  };

  it('resolveCodeRunnerCwd honors instance pathBase default', () => {
    const cfg: CodeRunnerConfig = {
      type: 'code-runner',
      command: 'npm test',
      captureOutput: true,
    };
    assert.equal(resolveCodeRunnerCwd(deps, cfg, 'inst-1'), '/instance/task');
  });

  it('resolveCodeRunnerCwd resolves relative workingDir under instance taskDir', () => {
    const cfg: CodeRunnerConfig = {
      type: 'code-runner',
      command: 'npm test',
      workingDir: 'pkg/sub',
      captureOutput: true,
    };
    assert.equal(resolveCodeRunnerCwd(deps, cfg, 'inst-1'), '/instance/task/pkg/sub');
  });

  it('resolveCodeRunnerCwd uses workspace root when pathBase=workspace', () => {
    const cfg: CodeRunnerConfig = {
      type: 'code-runner',
      command: 'npm test',
      pathBase: 'workspace',
      workingDir: 'packages/app',
      captureOutput: true,
    };
    assert.equal(resolveCodeRunnerCwd(deps, cfg, 'inst-1'), '/ws/packages/app');
  });
});
