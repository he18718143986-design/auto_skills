import type { CodeRunnerConfig, LlmTextConfig, Stage } from '../WorkflowDefinition';
import { CONFTEST_TEMPLATE } from '../python-bootstrap/conftestTemplate';
import { STAGE_TOOL_CODE_RUNNER, STAGE_TOOL_LLM_TEXT } from '../workflow/StageToolKinds';
import { RUNTIME_REPLAN_MARKER, RUNTIME_REPLAN_STAGE_ID_PREFIX } from './constants';
import type { RuntimeReplanTrigger } from './types';

function baseStage(opts: {
  id: string;
  title: string;
  description: string;
  tool: Stage['tool'];
  toolConfig: CodeRunnerConfig | LlmTextConfig;
  dependsOn: string[];
}): Stage {
  return {
    id: opts.id,
    title: opts.title,
    description: `${RUNTIME_REPLAN_MARKER} ${opts.description}`,
    tool: opts.tool,
    toolConfig: opts.toolConfig,
    dependsOn: opts.dependsOn,
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'replanOut', format: 'text' }],
    pauseAfter: false,
  };
}

export function buildConftestReplanStage(opts: {
  semantic: string;
  anchorStageId: string;
}): Stage {
  const id = `${RUNTIME_REPLAN_STAGE_ID_PREFIX}conftest_${opts.semantic}`;
  const toolConfig: LlmTextConfig = {
    type: STAGE_TOOL_LLM_TEXT,
    systemPrompt: [
      'preflight 检出 flat layout 缺少 conftest.py；写入以下模板到 conftest.py。',
      '不要修改内容，不要添加说明。',
      CONFTEST_TEMPLATE.trim(),
    ].join('\n'),
    writeOutputToFile: 'conftest.py',
    writePathBase: 'workspace',
  };
  return baseStage({
    id,
    title: `写入 conftest.py（${opts.semantic}）`,
    description: 'preflight 缺少 conftest.py；runtime replan 插入 conftest 阶段。',
    tool: STAGE_TOOL_LLM_TEXT,
    toolConfig,
    dependsOn: [opts.anchorStageId],
  });
}

export function buildPipPytestAsyncioReplanStage(opts: {
  semantic: string;
  anchorStageId: string;
}): Stage {
  const id = `${RUNTIME_REPLAN_STAGE_ID_PREFIX}pip_pytest_asyncio_${opts.semantic}`;
  const toolConfig: CodeRunnerConfig = {
    type: STAGE_TOOL_CODE_RUNNER,
    command: '.venv/bin/pip install "pytest-asyncio>=0.23.0"',
    captureOutput: true,
    pathBase: 'workspace',
    workingDir: '.',
  };
  return baseStage({
    id,
    title: `安装 pytest-asyncio（${opts.semantic}）`,
    description: 'preflight 检出缺少 pytest-asyncio；运行时 replan 插入 pip 阶段。',
    tool: STAGE_TOOL_CODE_RUNNER,
    toolConfig,
    dependsOn: [opts.anchorStageId],
  });
}

export function buildFixExhaustedReplanStage(opts: {
  semantic: string;
  anchorStageId: string;
  writeTarget: string;
  trigger: RuntimeReplanTrigger;
}): Stage {
  const id = `${RUNTIME_REPLAN_STAGE_ID_PREFIX}fix_${opts.semantic}`;
  const toolConfig: LlmTextConfig = {
    type: STAGE_TOOL_LLM_TEXT,
    systemPrompt: [
      `stage_fix_if_failed_${opts.semantic} 已达上限仍未能使 test_run 通过；执行 runtime-replan 升级修复。`,
      `只输出完整文件 ${opts.writeTarget}；禁止 Markdown 围栏。`,
      '阅读 test_run 失败输出，修复 import/导出/API/依赖问题；勿臆造第三方符号。',
      opts.trigger.message ? `test_run 输出摘要：\n${opts.trigger.message}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    writeOutputToFile: opts.writeTarget,
    writePathBase: 'workspace',
  };
  return baseStage({
    id,
    title: `Fix replan 升级（${opts.semantic}）`,
    description: `fix-exhausted：fix_if_failed 仍红`,
    tool: STAGE_TOOL_LLM_TEXT,
    toolConfig,
    dependsOn: [opts.anchorStageId],
  });
}

export function buildGateReplanLlmStage(opts: {
  semantic: string;
  anchorStageId: string;
  writeTarget: string;
  trigger: RuntimeReplanTrigger;
}): Stage {
  const id = `${RUNTIME_REPLAN_STAGE_ID_PREFIX}gate_${opts.semantic}`;
  const toolConfig: LlmTextConfig = {
    type: STAGE_TOOL_LLM_TEXT,
    systemPrompt: [
      `gate-repair 未能通过 ${opts.trigger.gateId ?? 'gate'}；执行 runtime-replan 修复。`,
      `只输出完整文件 ${opts.writeTarget}；禁止 Markdown 围栏。`,
      '对齐 test import 与 impl 导出；移除第三方幻觉 API（如 MdApi）。',
      opts.trigger.message ? `Gate 消息：${opts.trigger.message}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    writeOutputToFile: opts.writeTarget,
    writePathBase: 'workspace',
  };
  return baseStage({
    id,
    title: `Gate replan 修复（${opts.semantic}）`,
    description: `gate-repair-exhausted：${opts.trigger.gateId ?? 'gate'}`,
    tool: STAGE_TOOL_LLM_TEXT,
    toolConfig,
    dependsOn: [opts.anchorStageId],
  });
}
