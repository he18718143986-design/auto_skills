import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { CONFTEST_TEMPLATE, ensureConftestOnDisk } from '../python-bootstrap/conftestTemplate';
import { injectPythonConftestStage } from '../disk-bootstrap/pythonConftestStage';
import type { WorkflowDefinition } from '../WorkflowDefinition';

test('ensureConftestOnDisk writes template once', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-'));
  try {
    const first = ensureConftestOnDisk(tmp);
    assert.equal(first.written, true);
    const second = ensureConftestOnDisk(tmp);
    assert.equal(second.written, false);
    const raw = fs.readFileSync(first.path, 'utf8');
    assert.equal(raw, CONFTEST_TEMPLATE);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('injectPythonConftestStage adds stage_impl_conftest before test_run', () => {
  const wf: WorkflowDefinition = {
    version: '2.0',
    id: 'wf_py',
    meta: { title: 't', taskType: 'software', userInput: 'x', createdAt: new Date().toISOString() },
    stages: [
      {
        id: 'stage_impl_market_connector',
        title: 'impl',
        tool: 'llm-text',
        toolConfig: {
          type: 'llm-text',
          systemPrompt: 'x',
          writeOutputToFile: 'market_connector.py',
        },
        input: { sources: [], mergeStrategy: 'concat' },
        outputs: [{ key: 'out', format: 'text' }],
        pauseAfter: false,
      },
      {
        id: 'stage_test_run_market_connector',
        title: 'run',
        tool: 'code-runner',
        toolConfig: {
          type: 'code-runner',
          command: '.venv/bin/pytest tests/test_market_connector.py -v',
          captureOutput: true,
        },
        input: { sources: [], mergeStrategy: 'concat' },
        outputs: [{ key: 'out', format: 'text' }],
        pauseAfter: false,
      },
    ],
  };
  const out = injectPythonConftestStage(wf);
  const ids = out.stages.map((s) => s.id);
  assert.ok(ids.includes('stage_impl_conftest'));
  assert.ok(ids.indexOf('stage_impl_conftest') < ids.indexOf('stage_test_run_market_connector'));
});
