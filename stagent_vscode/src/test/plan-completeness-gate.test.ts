import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import type { Stage, WorkflowDefinition } from '../WorkflowDefinition';
import {
  lintPlanCompleteness,
  matchesEntryOutputPath,
  matchesMainAssemblyCommand,
  matchesMainAssemblyStageId,
  hasMainAssemblyStage,
  planRequiresTestInfrastructure,
  hasTestInfrastructureBeforeFirstTestRun,
  planSignalsExpoStack,
  firstTestRunStageIndex,
} from '../PlanCompletenessGate';

const META = {
  title: 't',
  taskType: 'software',
  userInput: 'x',
  createdAt: '2026-01-01T00:00:00.000Z',
};

function implStage(
  id: string,
  file: string,
  tool: Stage['tool'] = 'llm-text',
  systemPrompt = 'x',
): Stage {
  return {
    id,
    title: id,
    tool,
    toolConfig:
      tool === 'llm-text'
        ? { type: 'llm-text', systemPrompt, writeOutputToFile: file }
        : { type: 'code-runner', command: file, captureOutput: true },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'out', format: 'text' }],
    pauseAfter: false,
  };
}

function wf(stages: Stage[], taskType = 'software'): WorkflowDefinition {
  return { id: 'wf', version: '2.0', meta: { ...META, taskType }, stages };
}

function jestConfigStage(id = 'stage_impl_jest_config'): Stage {
  return implStage(id, 'jest.config.js');
}

function babelConfigStage(id = 'stage_impl_babel_config'): Stage {
  return implStage(id, 'babel.config.js');
}

function pythonVenvChainStages(): Stage[] {
  return [
    implStage('stage_venv_create', 'python3 -m venv .venv', 'code-runner'),
    implStage('stage_venv_pip_install', '.venv/bin/python -m pip install pytest', 'code-runner'),
    implStage('stage_venv_import_check', '.venv/bin/python -c "import pytest"', 'code-runner'),
  ];
}

function issueTypes(w: WorkflowDefinition): string[] {
  return lintPlanCompleteness(w).map((i) => i.type);
}

test('matchesEntryOutputPath: index.ts and App.tsx paths', () => {
  assert.equal(matchesEntryOutputPath('server/src/index.ts'), true);
  assert.equal(matchesEntryOutputPath('mobile/App.tsx'), true);
  assert.equal(matchesEntryOutputPath('main.py'), true);
  assert.equal(matchesEntryOutputPath('lib/roomService.ts'), false);
});

test('matchesMainAssemblyStageId: runner and app', () => {
  assert.equal(matchesMainAssemblyStageId('runner'), true);
  assert.equal(matchesMainAssemblyStageId('client_app_tsx'), true);
  assert.equal(matchesMainAssemblyStageId('room_service'), false);
});

test('matchesMainAssemblyCommand: start vs test', () => {
  assert.equal(matchesMainAssemblyCommand('npm start'), true);
  assert.equal(matchesMainAssemblyCommand('npx expo start'), true);
  assert.equal(matchesMainAssemblyCommand('npm test'), false);
  assert.equal(matchesMainAssemblyCommand('cd server && npx jest'), false);
  assert.equal(matchesMainAssemblyCommand('python main.py'), true);
});

test('lintPlanCompleteness: 3 modules without assembly → missing-main-assembly', () => {
  const w = wf([
    implStage('stage_impl_room_service', 'server/src/services/room.ts'),
    implStage('stage_impl_message_service', 'server/src/services/message.ts'),
    implStage('stage_impl_chat_ui', 'mobile/src/screens/Chat.tsx'),
    implStage('stage_impl_jest_config', 'server/jest.config.js'),
    implStage('stage_test_run_room', 'cd server && npm test', 'code-runner'),
  ]);
  assert.deepEqual(issueTypes(w), ['missing-main-assembly']);
});

test('lintPlanCompleteness: entry via writeOutputToFile index.ts passes', () => {
  const w = wf([
    implStage('stage_impl_room_service', 'server/src/services/room.ts'),
    implStage('stage_impl_message_service', 'server/src/services/message.ts'),
    implStage('stage_impl_server_index', 'server/src/index.ts'),
    implStage('stage_impl_jest_config', 'server/jest.config.js'),
    implStage('stage_test_run_room', 'cd server && npm test', 'code-runner'),
  ]);
  assert.deepEqual(issueTypes(w), []);
});

test('lintPlanCompleteness: entry via App.tsx passes', () => {
  const w = wf([
    implStage('stage_impl_a', 'server/a.ts'),
    implStage('stage_impl_b', 'server/b.ts'),
    implStage('stage_impl_mobile_app', 'mobile/App.tsx'),
    jestConfigStage(),
    babelConfigStage(),
    implStage('stage_test_run', 'npm test', 'code-runner'),
  ]);
  assert.equal(hasMainAssemblyStage(w), true);
  assert.equal(planSignalsExpoStack(w), true);
  assert.deepEqual(issueTypes(w), []);
});

test('lintPlanCompleteness: stage_impl_runner passes via id keyword', () => {
  const w = wf([
    implStage('stage_impl_a', 'server/a.ts'),
    implStage('stage_impl_b', 'server/b.ts'),
    implStage('stage_impl_runner', 'server/runner.ts'),
    jestConfigStage(),
    implStage('stage_test_run', 'npm test', 'code-runner'),
  ]);
  assert.deepEqual(issueTypes(w), []);
});

test('lintPlanCompleteness: code-runner npm start counts as assembly', () => {
  const w = wf([
    implStage('stage_impl_a', 'server/a.ts'),
    implStage('stage_impl_b', 'server/b.ts'),
    implStage('stage_impl_c', 'server/c.ts'),
    implStage('stage_boot', 'npm start', 'code-runner'),
  ]);
  assert.deepEqual(issueTypes(w), []);
});

test('lintPlanCompleteness: two code impls do not require main assembly', () => {
  const w = wf([
    implStage('stage_impl_a', 'server/a.ts'),
    implStage('stage_impl_b', 'server/b.ts'),
    jestConfigStage(),
    implStage('stage_test_run', 'npm test', 'code-runner'),
  ]);
  assert.deepEqual(issueTypes(w), []);
});

test('lintPlanCompleteness: missing verification when no test_run', () => {
  const w = wf([
    implStage('stage_impl_a', 'server/a.ts'),
    implStage('stage_impl_b', 'server/b.ts'),
    implStage('stage_impl_main', 'main.ts'),
  ]);
  assert.ok(issueTypes(w).includes('missing-verification-stage'));
});

test('lintPlanCompleteness: document taskType skipped', () => {
  const w = wf([implStage('stage_impl_a', 'a.ts'), implStage('stage_impl_b', 'b.ts')], 'document');
  assert.deepEqual(issueTypes(w), []);
});

test('M39.1: ts impls + stage_test_run without jest config → missing-test-infrastructure', () => {
  const w = wf([
    implStage('stage_impl_auth', 'src/auth.ts'),
    implStage('stage_impl_api', 'src/api.ts'),
    implStage('stage_test_run_auth', 'npm install --silent && npx jest --testPathPattern=auth', 'code-runner'),
  ]);
  assert.ok(issueTypes(w).includes('missing-test-infrastructure'));
  assert.equal(planRequiresTestInfrastructure(w), true);
  assert.equal(hasTestInfrastructureBeforeFirstTestRun(w), false);
});

test('M39.1: jest.config.js stage before test_run passes', () => {
  const w = wf([
    implStage('stage_impl_jest_config', 'jest.config.js'),
    implStage('stage_impl_auth', 'src/auth.ts'),
    implStage('stage_impl_api', 'src/api.ts'),
    implStage('stage_test_run_auth', 'npx jest --testPathPattern=auth', 'code-runner'),
  ]);
  assert.ok(!issueTypes(w).includes('missing-test-infrastructure'));
  assert.equal(firstTestRunStageIndex(w), 3);
});

test('M39.1: tsconfig.json before test_run passes (non-expo)', () => {
  const w = wf([
    implStage('stage_impl_tsconfig', 'tsconfig.json'),
    implStage('stage_impl_a', 'src/a.ts'),
    implStage('stage_test_run_a', 'npm test', 'code-runner'),
  ]);
  assert.deepEqual(issueTypes(w), []);
});

test('M39.1: Expo App.tsx + test_run requires jest and babel before test_run', () => {
  const wMissing = wf([
    implStage('stage_impl_mobile_app', 'mobile/App.tsx'),
    implStage('stage_impl_auth', 'src/auth.ts'),
    implStage('stage_impl_jest_config', 'jest.config.js'),
    implStage('stage_test_run_auth', 'npx jest', 'code-runner'),
  ]);
  assert.equal(planSignalsExpoStack(wMissing), true);
  assert.ok(issueTypes(wMissing).includes('missing-test-infrastructure'));

  const wOk = wf([
    implStage('stage_impl_jest_config', 'jest.config.js'),
    implStage('stage_impl_babel_config', 'babel.config.js'),
    implStage('stage_impl_mobile_app', 'mobile/App.tsx'),
    implStage('stage_impl_auth', 'src/auth.ts'),
    implStage('stage_test_run_auth', 'npx jest', 'code-runner'),
  ]);
  assert.ok(!issueTypes(wOk).includes('missing-test-infrastructure'));
});

test('M39.1: pytest-only python plan does not require jest infrastructure', () => {
  const w = wf(
    [
      ...pythonVenvChainStages(),
      implStage('stage_impl_conftest', 'conftest.py'),
      implStage('stage_impl_reader', 'reader.py'),
      implStage('stage_test_run_unit', 'python -m pytest tests/', 'code-runner'),
    ],
    'prototype',
  );
  assert.equal(planRequiresTestInfrastructure(w), false);
  assert.ok(!issueTypes(w).includes('missing-test-infrastructure'));
});

test('M39.1: jest.config.js impl does not inflate multi-module count for main assembly', () => {
  const w = wf([
    implStage('stage_impl_a', 'server/a.ts'),
    implStage('stage_impl_b', 'server/b.ts'),
    jestConfigStage(),
    implStage('stage_test_run', 'npm test', 'code-runner'),
  ]);
  assert.deepEqual(issueTypes(w), []);
});

test('M39.1: jest at repo root with cd server test_run → test-infra-path-mismatch', () => {
  const w = wf([
    jestConfigStage(),
    implStage('stage_impl_a', 'server/a.ts'),
    implStage('stage_test_run', 'cd server && npm test', 'code-runner'),
  ]);
  assert.ok(issueTypes(w).includes('test-infra-path-mismatch'));
});

test('M39.1: server/jest.config.js with cd server test_run passes path alignment', () => {
  const w = wf([
    implStage('stage_impl_jest_config', 'server/jest.config.js'),
    implStage('stage_impl_a', 'server/a.ts'),
    implStage('stage_test_run', 'cd server && npm test', 'code-runner'),
  ]);
  assert.ok(!issueTypes(w).includes('test-infra-path-mismatch'));
});

test('M39.1: stage_impl_jest_config id without write path still counts', () => {
  const w = wf([
    {
      ...implStage('stage_impl_jest_config', ''),
      toolConfig: { type: 'llm-text', systemPrompt: 'x', writeOutputToFile: '' },
    },
    implStage('stage_impl_a', 'src/a.ts'),
    implStage('stage_test_run_a', 'npm test', 'code-runner'),
  ]);
  assert.ok(!issueTypes(w).includes('missing-test-infrastructure'));
});

test('M40: docker stage prompting Dockerfile + docker-compose → multi-file-prompt-mismatch', () => {
  const w = wf([
    implStage(
      'stage_impl_docker',
      'server/Dockerfile',
      'llm-text',
      '生成 server/Dockerfile 和 docker-compose.yml，包含 Redis 与 Postgres 服务。',
    ),
    jestConfigStage('server/jest.config.js'),
    implStage('stage_test_run', 'cd server && npm test', 'code-runner'),
  ]);
  assert.ok(issueTypes(w).includes('multi-file-prompt-mismatch'));
});

test('M40: single-file docker prompt passes', () => {
  const w = wf([
    implStage(
      'stage_impl_dockerfile',
      'server/Dockerfile',
      'llm-text',
      '只输出 server/Dockerfile 正文，FROM node:20，WORKDIR /app。',
    ),
    jestConfigStage('server/jest.config.js'),
    implStage('stage_test_run', 'cd server && npm test', 'code-runner'),
  ]);
  assert.ok(!issueTypes(w).includes('multi-file-prompt-mismatch'));
});

test('M41: Express decision + NestJS test_write prompt → test-stack-nestjs-mismatch', () => {
  const w = wf([
    {
      ...implStage('stage_decide_arch', 'n/a', 'llm-text', '后端采用 Node.js + Express + Socket.io。'),
      id: 'stage_decide_architecture',
      isDecisionStage: true,
    },
    implStage(
      'stage_test_write_voice_integration',
      'server/__tests__/voice_integration.test.ts',
      'llm-text',
      "import { Test, TestingModule } from '@nestjs/testing';\nimport { INestApplication } from '@nestjs/common';",
    ),
    implStage('stage_test_run_voice_integration', 'cd server && npm test', 'code-runner'),
  ]);
  assert.ok(issueTypes(w).includes('test-stack-nestjs-mismatch'));
});

test('M41: upstream_fix routes server test_run to server impl in mixed slice', () => {
  const w = wf([
    makeDecide('stage_decide_voice'),
    implStage('stage_impl_webrtc_signaling', 'server/src/signaling.ts'),
    implStage('stage_impl_call_session', 'server/src/call_session.ts'),
    implStage('stage_impl_call_ui_call_button', 'mobile/lib/call_button.dart'),
    implStage('stage_test_write_call_ui', 'mobile/test/call_widget_test.dart'),
    implStage('stage_test_run_voice_integration', 'cd server && npm test -- voice', 'code-runner'),
  ]);
  assert.ok(!issueTypes(w).includes('upstream-fix-stack-routing'));
});

test('M41: server test_run with only mobile impls → upstream-fix-stack-routing', () => {
  const w = wf([
    makeDecide('stage_decide_voice'),
    implStage('stage_impl_call_ui_call_button', 'mobile/lib/call_button.dart'),
    implStage('stage_test_write_call_ui', 'mobile/test/call_widget_test.dart'),
    implStage('stage_test_run_voice_integration', 'cd server && npm test -- voice', 'code-runner'),
  ]);
  assert.ok(issueTypes(w).includes('upstream-fix-stack-routing'));
});

test('M39.3: test_write prompt imports ../src/app but plan only has index.ts → test-write-import-not-in-plan', () => {
  const w = wf([
    implStage('stage_impl_server_entry', 'server/src/index.ts'),
    implStage(
      'stage_test_write_chat_integration',
      'server/__tests__/chat_integration.test.ts',
      'llm-text',
      "import { startServer } from '../src/app';\n编写 Jest 集成测试，覆盖 Socket.io 连接与匹配。",
    ),
    implStage('stage_test_run_chat_integration', 'cd server && npm test -- chat_integration', 'code-runner'),
  ]);
  assert.ok(issueTypes(w).includes('test-write-import-not-in-plan'));
});

test('M39.3: test_write prompt imports ../src/index aligned with plan passes', () => {
  const w = wf([
    implStage('stage_impl_server_entry', 'server/src/index.ts'),
    implStage(
      'stage_test_write_chat_integration',
      'server/__tests__/chat_integration.test.ts',
      'llm-text',
      "import { startServer } from '../src/index';\nJest integration tests for Socket.io.",
    ),
    implStage('stage_test_run_chat_integration', 'cd server && npm test -- chat_integration', 'code-runner'),
  ]);
  assert.ok(!issueTypes(w).includes('test-write-import-not-in-plan'));
});

test('M39.3: server integration test_write without import declaration → test-write-import-undeclared', () => {
  const w = wf([
    implStage('stage_impl_server_entry', 'server/src/index.ts'),
    implStage(
      'stage_test_write_chat_integration',
      'server/__tests__/chat_integration.test.ts',
      'llm-text',
      '编写 Jest 集成测试，使用 socket.io-client 模拟两个客户端，测试连接与匹配。',
    ),
    implStage('stage_test_run_chat_integration', 'cd server && npm test -- chat_integration', 'code-runner'),
  ]);
  assert.ok(issueTypes(w).includes('test-write-import-undeclared'));
});

function makeDecide(id: string): Stage {
  return {
    ...implStage(id, 'n/a', 'llm-text', 'decide'),
    isDecisionStage: true,
  };
}
