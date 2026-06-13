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
  injectDeliveryWrapupStage,
  collectDeliverableFilePaths,
  DELIVERY_WRAPUP_STAGE_ID,
  injectSmokeStage,
  looksLikeServeCommand,
  SMOKE_RUN_STAGE_ID,
  patchNpmDefaultTestScriptAfterInit,
} from '../WorkflowDiskBootstrap';
import { verifyRule20 } from '../Rule20Verify';
import { lintPlanCompleteness } from '../PlanCompletenessGate';
import { setSelfHealGapDetector } from '../plan-completeness/selfHealGapDetector';
import { auditSelfHealGaps } from '../workflow-self-heal/injectSelfHealStages';
import type { Stage, WorkflowDefinition } from '../WorkflowDefinition';

setSelfHealGapDetector(auditSelfHealGaps);

function implStage(id: string, file: string): Stage {
  return {
    id,
    title: id,
    tool: 'llm-text',
    toolConfig: { type: 'llm-text', systemPrompt: 'x', writeOutputToFile: file, writePathBase: 'workspace' },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'code', format: 'text' }],
    pauseAfter: false,
  };
}

test('injectDeliveryWrapupStage 末尾追加 DELIVERY.md 验收阶段（含产物清单、幂等）', () => {
  const stages = [implStage('stage_impl_server_entry', 'server/src/index.ts')];
  const out = injectDeliveryWrapupStage(stages);
  const last = out[out.length - 1]!;
  assert.equal(last.id, DELIVERY_WRAPUP_STAGE_ID);
  assert.equal(last.tool, 'llm-text');
  assert.equal((last.toolConfig as { writeOutputToFile?: string }).writeOutputToFile, 'DELIVERY.md');
  assert.equal(last.pauseAfter, true); // 里程碑可感知验收
  assert.ok((last.toolConfig as { systemPrompt: string }).systemPrompt.includes('server/src/index.ts'));
  assert.deepEqual(injectDeliveryWrapupStage(out), out); // 幂等
});

test('injectDeliveryWrapupStage 无实现产物时不注入（纯文档/空计划）', () => {
  const testOnly: Stage = {
    id: 'stage_test_write_x',
    title: 't',
    tool: 'llm-text',
    toolConfig: { type: 'llm-text', systemPrompt: 'x', writeOutputToFile: 'server/__tests__/x.test.ts' },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'testCode', format: 'text' }],
    pauseAfter: false,
  };
  assert.equal(injectDeliveryWrapupStage([testOnly]).length, 1);
});

test('collectDeliverableFilePaths 去重收集 writeOutputToFile', () => {
  const paths = collectDeliverableFilePaths([
    implStage('stage_impl_a', 'a.ts'),
    implStage('stage_impl_b', 'b.ts'),
    implStage('stage_impl_a2', 'a.ts'),
  ]);
  assert.deepEqual(paths.sort(), ['a.ts', 'b.ts']);
});

test('looksLikeServeCommand 识别长驻启动命令', () => {
  assert.equal(looksLikeServeCommand('cd server && npm start'), true);
  assert.equal(looksLikeServeCommand('npm run dev'), true);
  assert.equal(looksLikeServeCommand('node dist/index.js'), true);
  assert.equal(looksLikeServeCommand('uvicorn app:app'), true);
  assert.equal(looksLikeServeCommand('cd server && npm test'), false);
});

function codeRunner(id: string, command: string): Stage {
  return {
    id,
    title: id,
    tool: 'code-runner',
    toolConfig: { type: 'code-runner', command, captureOutput: true, pathBase: 'workspace' },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'out', format: 'text' }],
    pauseAfter: false,
  };
}

test('injectSmokeStage：复用已有 serve 命令，serve=true 有界，放在交付收口前', () => {
  const stages = [
    codeRunner('stage_run_server', 'cd server && npm start'),
    {
      id: DELIVERY_WRAPUP_STAGE_ID,
      title: 'delivery',
      tool: 'llm-text',
      toolConfig: { type: 'llm-text', systemPrompt: 'x', writeOutputToFile: 'DELIVERY.md' },
      input: { sources: [], mergeStrategy: 'concat' },
      outputs: [{ key: 'delivery', format: 'markdown' }],
      pauseAfter: true,
    } as Stage,
  ];
  const out = injectSmokeStage(stages);
  const smokeIdx = out.findIndex((s) => s.id === SMOKE_RUN_STAGE_ID);
  const deliveryIdx = out.findIndex((s) => s.id === DELIVERY_WRAPUP_STAGE_ID);
  assert.ok(smokeIdx >= 0 && smokeIdx < deliveryIdx); // 在收口前
  const cfg = out[smokeIdx]!.toolConfig as { serve?: boolean; command: string };
  assert.equal(cfg.serve, true);
  assert.equal(cfg.command, 'cd server && npm start');
  assert.deepEqual(injectSmokeStage(out), out); // 幂等
});

test('injectSmokeStage：从 JS 入口产物推导 node 启动命令', () => {
  const out = injectSmokeStage([implStage('stage_impl_entry', 'dist/index.js')]);
  const smoke = out.find((s) => s.id === SMOKE_RUN_STAGE_ID);
  assert.ok(smoke);
  assert.equal((smoke!.toolConfig as { command: string }).command, 'node dist/index.js');
});

test('injectSmokeStage：无法可靠推导启动命令时不注入（仅 TS server，需构建）', () => {
  const out = injectSmokeStage([implStage('stage_impl_server_entry', 'server/src/index.ts')]);
  assert.equal(out.some((s) => s.id === SMOKE_RUN_STAGE_ID), false);
});

test('verifyRule20 不因交付收口阶段报 violation', () => {
  const wf = minimalSoftwareWf([
    implStage('stage_impl_server_entry', 'server/src/index.ts'),
  ]);
  const before = verifyRule20(wf).violations.length;
  const withDelivery = { ...wf, stages: injectDeliveryWrapupStage(wf.stages) };
  const after = verifyRule20(withDelivery).violations.length;
  assert.equal(after, before); // 收口阶段不新增 Rule20 violation
});

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

test('applySoftwareDiskPipeline injects self-heal chain for test_write/test_run slices', () => {
  const wf = minimalSoftwareWf([
    implStage('stage_impl_market_connector', 'server/src/market_connector.ts'),
    implStage('stage_test_write_market_connector', 'server/__tests__/market_connector.test.ts'),
    {
      id: 'stage_test_run_market_connector',
      title: 'run',
      tool: 'code-runner',
      toolConfig: { type: 'code-runner', command: 'cd server && npm test -- market_connector', captureOutput: true },
      input: { sources: [], mergeStrategy: 'concat' },
      outputs: [{ key: 'testResults', format: 'json' }],
      pauseAfter: false,
    },
    implStage('stage_test_write_index_resonance', 'server/__tests__/index_resonance.test.ts'),
    {
      id: 'stage_test_run_index_resonance',
      title: 'run',
      tool: 'code-runner',
      toolConfig: { type: 'code-runner', command: 'cd server && npm test -- index_resonance', captureOutput: true },
      input: { sources: [], mergeStrategy: 'concat' },
      outputs: [{ key: 'testResults', format: 'json' }],
      pauseAfter: false,
    },
  ]);
  const next = applySoftwareDiskPipeline(wf);
  const ids = next.stages.map((s) => s.id);
  assert.ok(ids.includes('stage_npm_install_server'));
  assert.ok(ids.includes('stage_verify_imports_market_connector'));
  assert.ok(ids.includes('stage_fix_if_failed_market_connector'));
  assert.ok(ids.includes('stage_verify_imports_index_resonance'));
  assert.ok(ids.includes('stage_fix_if_failed_index_resonance'));
  const writeIdx = ids.indexOf('stage_test_write_index_resonance');
  const importsIdx = ids.indexOf('stage_verify_imports_index_resonance');
  const runIdx = ids.indexOf('stage_test_run_index_resonance');
  assert.ok(importsIdx > writeIdx && runIdx > importsIdx);
  assert.equal(lintPlanCompleteness(next).some((i) => i.type === 'missing-self-heal-chain'), false);
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
