import type { CodeRunnerConfig, LlmTextConfig, Stage, StageInput } from '../WorkflowDefinition';
import { STAGE_TOOL_CODE_RUNNER, STAGE_TOOL_LLM_TEXT } from '../workflow/StageToolKinds';
import { VERIFY_OUT_OUTPUT_KEY } from '../WorkflowOutputKeys';
import { isTestRunStageId, semanticNameFromTestRunStageId } from '../workflow/StageIdPatterns';

export function isBundleWriteStageId(stageId: string): boolean {
  return stageId.endsWith('_stagent_bundle_write');
}

export function isSelfHealStageId(stageId: string): boolean {
  return (
    stageId.startsWith('stage_verify_') ||
    stageId.startsWith('stage_fix_if_failed_') ||
    stageId === 'stage_npm_install_server'
  );
}

function codeRunnerStage(opts: {
  id: string;
  title: string;
  description: string;
  command: string;
  dependsOn?: string[];
  input?: StageInput;
}): Stage {
  const toolConfig: CodeRunnerConfig = {
    type: STAGE_TOOL_CODE_RUNNER,
    command: opts.command,
    captureOutput: true,
    pathBase: 'workspace',
    workingDir: '.',
  };
  return {
    id: opts.id,
    title: opts.title,
    description: opts.description,
    tool: STAGE_TOOL_CODE_RUNNER,
    toolConfig,
    ...(opts.dependsOn?.length ? { dependsOn: opts.dependsOn } : {}),
    input: opts.input ?? { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: VERIFY_OUT_OUTPUT_KEY, format: 'text' }],
    pauseAfter: false,
  };
}

export function buildNpmInstallServerStage(dependsOn: string[]): Stage {
  return codeRunnerStage({
    id: 'stage_npm_install_server',
    title: '安装服务端依赖（首个 test_run 前）',
    description: '在 server/ 执行 npm install，确保 Jest 与测试依赖可用。',
    command: 'cd server && npm install',
    dependsOn,
  });
}

export function buildVerifyServerTscStage(opts: {
  id: string;
  title: string;
  dependsOn: string[];
}): Stage {
  return codeRunnerStage({
    id: opts.id,
    title: opts.title,
    description: '运行 tsc --noEmit；失败时由后续 fix 阶段修复。',
    command: 'cd server && npx tsc --noEmit',
    dependsOn: opts.dependsOn,
  });
}

export function buildVerifyImportsStage(opts: {
  id: string;
  title: string;
  testFiles: string[];
  dependsOn: string[];
}): Stage {
  const files = opts.testFiles.join(' ');
  return codeRunnerStage({
    id: opts.id,
    title: opts.title,
    description: '校验测试文件相对 import 在工作区存在，避免 test_run 因路径幻觉失败。',
    command: `node scripts/verify-test-imports.mjs ${files}`,
    dependsOn: opts.dependsOn,
  });
}

export function buildFixIfFailedStage(opts: {
  id: string;
  title: string;
  testRunStageId: string;
  verifyTscStageId: string;
  dependsOn: string[];
  writeTargets: string[];
}): Stage {
  const semantic = semanticNameFromTestRunStageId(opts.testRunStageId) ?? 'unknown';
  const toolConfig: LlmTextConfig = {
    type: STAGE_TOOL_LLM_TEXT,
    systemPrompt: [
      `测试阶段 stage_test_run_${semantic} 失败后执行修复。`,
      '步骤：1) 阅读上一 test_run 与 tsc 输出；2) 修复缺失文件、错误 import、类型错误；3) 优先保证 server/src/app.ts 导出 startServer/stopServer/clearRedisQueues/setTestMode。',
      `可修改文件：${opts.writeTargets.join('、') || 'server/src 下相关文件'}。`,
      '只输出需要写入的完整文件内容到 writeOutputToFile 指定路径；禁止 Markdown 围栏。',
    ].join('\n'),
    writeOutputToFile: opts.writeTargets[0],
    writePathBase: 'workspace',
  };
  return {
    id: opts.id,
    title: opts.title,
    description: 'test_run 失败后：根据 tsc 与测试输出修复代码，供重试 test_run。',
    tool: STAGE_TOOL_LLM_TEXT,
    toolConfig,
    dependsOn: opts.dependsOn,
    input: {
      sources: [
        {
          type: 'stage-output',
          stageId: opts.testRunStageId,
          outputKey: VERIFY_OUT_OUTPUT_KEY,
          label: 'test_run 输出',
        },
        {
          type: 'stage-output',
          stageId: opts.verifyTscStageId,
          outputKey: VERIFY_OUT_OUTPUT_KEY,
          label: 'tsc 诊断',
        },
      ],
      mergeStrategy: 'concat',
    },
    outputs: [{ key: 'fixPatch', format: 'text' }],
    pauseAfter: false,
  };
}

export function buildServerAppEntryStage(dependsOn: string[]): Stage {
  const toolConfig: LlmTextConfig = {
    type: STAGE_TOOL_LLM_TEXT,
    systemPrompt: [
      '生成 server/src/app.ts：从 index.ts 拆分测试/生产共用逻辑。',
      '必须导出：setTestMode, clearRedisQueues, startServer(port), stopServer。',
      'startServer 创建 express+socket.io，连接时下发 identity 消息，处理 match_request/chat_message 等。',
      'index.ts 仅 import startProductionServer 并监听 PORT。',
      '输出纯 TypeScript，无 Markdown 围栏。',
    ].join('\n'),
    writeOutputToFile: 'server/src/app.ts',
    writePathBase: 'workspace',
  };
  return {
    id: 'stage_impl_server_app',
    title: '实现 server/src/app.ts（测试入口拆分）',
    description: '补齐集成测试所需的 app 导出，避免测试 import ../src/app 失败。',
    tool: STAGE_TOOL_LLM_TEXT,
    toolConfig,
    dependsOn,
    input: {
      sources: [
        {
          type: 'stage-output',
          stageId: 'stage_decide_architecture_overview',
          outputKey: 'decisionRecord',
          label: '架构决策',
        },
      ],
      mergeStrategy: 'concat',
    },
    outputs: [{ key: 'appTs', format: 'text' }],
    pauseAfter: false,
  };
}

export function inferServerTestFile(testRunStageId: string): string | undefined {
  if (!isTestRunStageId(testRunStageId)) {
    return undefined;
  }
  const semantic = semanticNameFromTestRunStageId(testRunStageId);
  if (!semantic) {
    return undefined;
  }
  if (/_(ui|call_ui)$/.test(semantic) || semantic === 'all_tests') {
    return undefined;
  }
  return `server/__tests__/${semantic}.test.ts`;
}
