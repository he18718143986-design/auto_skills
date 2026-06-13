import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { lintPythonPypiSymbolsOnDisk } from '../python-contract/PythonPypiSymbolLint';
import {
  collectPythonPypiSymbolIssues,
  runPythonPypiSymbolHardGate,
  type WorkspaceLintContext,
} from '../WorkflowEngineWorkspaceLint';
import type { WorkflowDefinition } from '../WorkflowDefinition';

test('lintPythonPypiSymbolsOnDisk flags MdApi in impl', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pypi-lint-'));
  const impl = path.join(dir, 'market_connector.py');
  fs.writeFileSync(impl, 'from ctpbee import MdApi\n', 'utf8');
  const issues = lintPythonPypiSymbolsOnDisk({
    workspaceRoot: dir,
    pyFiles: ['market_connector.py'],
  });
  assert.equal(issues.length, 1);
  assert.equal(issues[0]!.symbol, 'MdApi');
});

test('runPythonPypiSymbolHardGate returns null when mode is warn', async () => {
  const ctx: WorkspaceLintContext = {
    instance: undefined,
    workspaceRootAbsolute: '/tmp',
    glossaryEnabled: false,
    sdkPathContractLintMode: 'off',
    pythonExportContractLintMode: 'off',
    pythonPypiSymbolLintMode: 'warn',
  };
  assert.equal(await runPythonPypiSymbolHardGate(ctx), null);
});

test('collectPythonPypiSymbolIssues scans workflow artifact py files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pypi-wf-'));
  fs.writeFileSync(path.join(dir, 'app.py'), 'from ctpbee import create_md_api\n', 'utf8');
  const wf: WorkflowDefinition = {
    id: 'wf',
    version: '2.0',
    meta: { title: 't', taskType: 'software', userInput: 'u', createdAt: new Date().toISOString() },
    stages: [
      {
        id: 'stage_impl_app',
        title: 'impl',
        tool: 'llm-text',
        toolConfig: { type: 'llm-text', systemPrompt: 'x', writeOutputToFile: 'app.py' },
        input: { sources: [], mergeStrategy: 'concat' },
        outputs: [{ key: 'out', format: 'text' }],
        pauseAfter: false,
      },
    ],
  };
  const ctx: WorkspaceLintContext = {
    instance: {
      definition: wf,
      stageRuntimes: [],
      currentStageIndex: 0,
      status: 'running',
    },
    workspaceRootAbsolute: dir,
    glossaryEnabled: false,
    sdkPathContractLintMode: 'off',
    pythonExportContractLintMode: 'off',
    pythonPypiSymbolLintMode: 'hard',
  };
  const issues = collectPythonPypiSymbolIssues(ctx);
  assert.equal(issues.length, 1);
  assert.equal(issues[0]!.symbol, 'create_md_api');
});
