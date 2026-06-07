import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  STAGE_INIT_NPM_WORKSPACE_ID,
  applySoftwareDiskPipeline,
  injectFileWriteAfterImplStages,
  injectInitNpmWorkspaceStage,
  patchNpmDefaultTestScriptAfterInit,
} from '../WorkflowDiskBootstrap';
import { verifyRule20 } from '../Rule20Verify';
import type { Stage, WorkflowDefinition } from '../WorkflowDefinition';

function minimalSoftwareWf(stages: Stage[]): WorkflowDefinition {
  return {
    id: 'wf_t',
    version: '2.0',
    meta: {
      title: 't',
      taskType: 'software',
      userInput: 'u',
      createdAt: new Date().toISOString(),
    },
    stages,
  };
}

test('injectInitNpmWorkspaceStage prepends stable id once', () => {
  const impl: Stage = {
    id: 'stage_impl_x',
    title: 'impl',
    tool: 'llm-text',
    toolConfig: { type: 'llm-text', systemPrompt: 'x' },
    input: { sources: [{ type: 'user-input', label: 'u' }], mergeStrategy: 'concat' },
    outputs: [{ key: 'text', format: 'text' }],
    pauseAfter: false,
  };
  const s = injectInitNpmWorkspaceStage([impl]);
  assert.equal(s[0].id, STAGE_INIT_NPM_WORKSPACE_ID);
  assert.equal(s[0].tool, 'code-runner');
  assert.equal((s[0].toolConfig as { pathBase?: string }).pathBase, 'workspace');
  assert.equal(s.length, 2);
  assert.deepEqual(injectInitNpmWorkspaceStage(s), s);
});

test('injectFileWriteAfterImplStages inserts file-write with sourceStageId', () => {
  const impl: Stage = {
    id: 'stage_impl_slice',
    title: 'impl',
    tool: 'llm-text',
    toolConfig: { type: 'llm-text', systemPrompt: 'x' },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'implementationCode', format: 'text' }],
    pauseAfter: false,
  };
  const out = injectFileWriteAfterImplStages([impl]);
  assert.equal(out.length, 2);
  assert.equal(out[1].tool, 'file-write');
  const tc = out[1].toolConfig as { sourceStageId?: string; pathBase?: string; filePath?: string };
  assert.equal(tc.sourceStageId, 'stage_impl_slice');
  assert.equal(tc.pathBase, 'workspace');
  assert.match(tc.filePath ?? '', /stage_impl_slice/);
});

test('patchNpmDefaultTestScriptAfterInit replaces npm default test only', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stagent-patch-'));
  try {
    const pkgPath = path.join(dir, 'package.json');
    fs.writeFileSync(
      pkgPath,
      JSON.stringify(
        {
          name: 'x',
          scripts: { test: 'echo "Error: no test specified" && exit 1' },
        },
        null,
        2,
      ) + '\n',
      'utf-8',
    );
    assert.equal(patchNpmDefaultTestScriptAfterInit(dir), true);
    const next = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { scripts: { test: string } };
    assert.match(next.scripts.test, /process\.exit\(0\)/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('patchNpmDefaultTestScriptAfterInit leaves custom test script', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stagent-patch-'));
  try {
    const pkgPath = path.join(dir, 'package.json');
    fs.writeFileSync(
      pkgPath,
      JSON.stringify({ name: 'x', scripts: { test: 'jest' } }, null, 2) + '\n',
      'utf-8',
    );
    assert.equal(patchNpmDefaultTestScriptAfterInit(dir), false);
    const next = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { scripts: { test: string } };
    assert.equal(next.scripts.test, 'jest');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('applySoftwareDiskPipeline composes init + bundle + test_run pathBase', () => {
  const wf = minimalSoftwareWf([
    {
      id: 'stage_impl_a',
      title: 'a',
      tool: 'llm-text',
      toolConfig: { type: 'llm-text', systemPrompt: 's' },
      input: { sources: [], mergeStrategy: 'concat' },
      outputs: [{ key: 'implementationCode', format: 'text' }],
      pauseAfter: false,
    },
    {
      id: 'stage_test_run_a',
      title: 'run',
      tool: 'code-runner',
      toolConfig: { type: 'code-runner', command: 'npm test', captureOutput: true },
      input: { sources: [], mergeStrategy: 'concat' },
      outputs: [{ key: 'testResults', format: 'json' }],
      pauseAfter: false,
    },
  ]);
  const next = applySoftwareDiskPipeline(wf);
  assert.equal(next.stages[0].id, STAGE_INIT_NPM_WORKSPACE_ID);
  const run = next.stages.find((s) => s.id === 'stage_test_run_a');
  assert.ok(run);
  assert.equal((run!.toolConfig as { pathBase?: string }).pathBase, 'workspace');
});

test('verifyRule20 ignores injected *_stagent_bundle_write file-write stages', () => {
  const wf = applySoftwareDiskPipeline(
    minimalSoftwareWf([
      {
        id: 'stage_decide_parser',
        title: 'decide',
        tool: 'llm-text',
        toolConfig: { type: 'llm-text', systemPrompt: 'decision' },
        input: { sources: [{ type: 'user-input', label: 'u' }], mergeStrategy: 'concat' },
        outputs: [{ key: 'decisionRecord', format: 'markdown' }],
        pauseAfter: true,
        isDecisionStage: true,
      },
      {
        id: 'stage_impl_parser',
        title: 'impl',
        tool: 'llm-text',
        toolConfig: { type: 'llm-text', systemPrompt: '严格按照已确认的决策清单实现，不得偏离。' },
        input: {
          sources: [
            {
              type: 'stage-output',
              stageId: 'stage_decide_parser',
              outputKey: 'decisionRecord',
              label: '决策',
            },
          ],
          mergeStrategy: 'concat',
        },
        outputs: [{ key: 'code', format: 'text' }],
        pauseAfter: false,
      },
    ]),
  );
  assert.ok(wf.stages.some((s) => s.id === 'stage_impl_parser_stagent_bundle_write'));
  const result = verifyRule20(wf);
  assert.equal(
    result.violations.some((v) => v.stageId?.endsWith('_stagent_bundle_write')),
    false,
    'bundle write 落盘阶段不应触发 missing-decision-stage',
  );
});

test('M29: decision-backed impl without 1:1 decide is warning, not blocking violation', () => {
  const wf = minimalSoftwareWf([
    {
      id: 'stage_decide_architecture_overview',
      title: '全局架构决策',
      tool: 'llm-text',
      toolConfig: { type: 'llm-text', systemPrompt: 'decision' },
      input: { sources: [{ type: 'user-input', label: 'u' }], mergeStrategy: 'concat' },
      outputs: [{ key: 'decisionRecord', format: 'markdown' }],
      pauseAfter: true,
      isDecisionStage: true,
    },
    {
      id: 'stage_impl_backend_utils',
      title: '实现后端公共工具模块',
      tool: 'llm-text',
      toolConfig: { type: 'llm-text', systemPrompt: '严格按照已确认的决策清单实现，不得偏离。' },
      input: {
        sources: [
          {
            type: 'stage-output',
            stageId: 'stage_decide_architecture_overview',
            outputKey: 'decisionRecord',
            label: '决策',
          },
        ],
        mergeStrategy: 'concat',
      },
      outputs: [{ key: 'code', format: 'text' }],
      pauseAfter: false,
    },
  ]);
  const result = verifyRule20(wf);
  // 20-A/20-B 已放宽：impl 有决策背书但缺同名 decide → warning；架构决策被消费 → warning。
  assert.equal(
    result.violations.some((v) => v.type === 'missing-decision-stage'),
    false,
    '有决策背书的 impl 不应触发 missing-decision-stage 硬违规',
  );
  assert.equal(
    result.violations.some((v) => v.type === 'broken-naming-pair'),
    false,
    '被实现消费的架构决策不应触发 broken-naming-pair 硬违规',
  );
  assert.ok(result.warnings.some((w) => w.type === 'impl-decision-not-paired'));
  assert.ok(result.warnings.some((w) => w.type === 'decision-not-paired'));
});

test('M29: impl with no decisionRecord source still blocks via missing-decision-stage', () => {
  const wf = minimalSoftwareWf([
    {
      id: 'stage_impl_orphan',
      title: 'impl 无决策背书',
      tool: 'llm-text',
      toolConfig: { type: 'llm-text', systemPrompt: '请实现。' },
      input: { sources: [{ type: 'user-input', label: 'u' }], mergeStrategy: 'concat' },
      outputs: [{ key: 'code', format: 'text' }],
      pauseAfter: false,
    },
  ]);
  const result = verifyRule20(wf);
  assert.ok(
    result.violations.some((v) => v.type === 'missing-decision-stage' && v.stageId === 'stage_impl_orphan'),
    '完全无决策背书的 impl 仍应硬拦',
  );
});

test('applySoftwareDiskPipeline handles undefined stages without throwing', () => {
  const wf = {
    id: 'wf_missing',
    version: '2.0',
    meta: {
      title: 'missing stages',
      taskType: 'software',
      userInput: 'u',
      createdAt: new Date().toISOString(),
    },
  } as unknown as WorkflowDefinition;
  const next = applySoftwareDiskPipeline(wf);
  assert.ok(Array.isArray(next.stages));
  assert.equal(next.stages.length, 1);
  assert.equal(next.stages[0]?.id, 'stage_init_npm_workspace');
});
