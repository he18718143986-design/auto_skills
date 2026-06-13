import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CodeRunnerConfig } from '../WorkflowDefinition';
import { resolveCodeRunnerCwd } from '../WorkflowCodeRunnerHost';

describe('WorkflowCodeRunnerHost', () => {
  it('resolveCodeRunnerCwd uses workspace root + workingDir when pathBase=workspace', () => {
    const cfg: CodeRunnerConfig = {
      type: 'code-runner',
      command: 'npm test',
      pathBase: 'workspace',
      workingDir: 'app',
      captureOutput: true,
    };
    const cwd = resolveCodeRunnerCwd(
      {
        ensureTaskDir: () => '/instance-root',
        getWorkspaceRootAbsolute: () => '/workspace',
        safeJoinUnderWorkspaceRoot: (root, rel) => `${root}/${rel}`,
        resolveTaskFilePath: (_k, fp) => `/instance-root/${fp}`,
        postStreamChunk: () => {},
        warn: () => {},
        sandboxEnabled: false,
        sandboxVerificationOnly: false,
      },
      cfg,
      'inst-1',
    );
    assert.equal(cwd, '/workspace/app');
  });

  it('resolveCodeRunnerCwd falls back to instance taskDir when workspace missing', () => {
    const cfg: CodeRunnerConfig = {
      type: 'code-runner',
      command: 'npm test',
      pathBase: 'workspace',
      captureOutput: true,
    };
    const cwd = resolveCodeRunnerCwd(
      {
        ensureTaskDir: () => '/instance-root',
        getWorkspaceRootAbsolute: () => undefined,
        safeJoinUnderWorkspaceRoot: (root, rel) => `${root}/${rel}`,
        resolveTaskFilePath: (_k, fp) => `/instance-root/${fp}`,
        postStreamChunk: () => {},
        warn: () => {},
        sandboxEnabled: false,
        sandboxVerificationOnly: false,
      },
      cfg,
      'inst-1',
    );
    assert.equal(cwd, '/instance-root');
  });
});
