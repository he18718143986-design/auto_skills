import { executeImplWithHollowGuard } from '../ImplOutputExecution';
import { applyPreStageQualityGates } from '../WorkflowStagePreGates';
import type { ToolPathBase } from '../WorkflowDefinition';
import type { PanelLike } from '../WorkflowExecutorTypes';
import { isImplStageId } from '../workflow/StageIdPatterns';
import { resolveEffectiveRetryComment } from '../retry/FailureSnapshot';
import { StageAlreadyHandledError } from './StageControlSignals';
import type { StageStepContext } from './StageStepContext';

import {
  WRITE_INTEGRITY_RETRY_SYSTEM_APPEND,
  WRITE_INTEGRITY_RETRY_USER_APPEND,
} from './llm-persist/writeOutputIntegrityAssess';
import { buildWriteOutputPromptSuffix } from './llm-persist/writeOutputPromptSuffix';
import { buildTestWriteImportPromptSuffix } from './llm-persist/testWriteImportPromptSuffix';
import { isTestWriteStageId } from '../workflow/StageIdPatterns';

export type InvokeLlmTextOptions = {
  writeIntegrityRetry?: boolean;
};

export async function invokeLlmTextForStage(
  ctx: StageStepContext,
  attempt: number,
  panel: PanelLike,
  options?: InvokeLlmTextOptions,
): Promise<string> {
  const { params, stage, runtime } = ctx;
  const { resolveInput, executeLlmText } = params;
  const tc = stage.toolConfig as {
    type: 'llm-text';
    systemPrompt: string;
    writeOutputToFile?: string;
    writePathBase?: ToolPathBase;
  };
  let sys = tc.systemPrompt;
  if (tc.writeOutputToFile?.trim()) {
    sys += `\n\n${buildWriteOutputPromptSuffix(tc.writeOutputToFile.trim())}`;
  }
  if (isTestWriteStageId(stage.id)) {
    const importSuffix = buildTestWriteImportPromptSuffix(ctx.instance.definition, stage);
    if (importSuffix) {
      sys += `\n\n${importSuffix}`;
    }
  }
  // 自动重试上下文只注入 system prompt，不写 runtime.retryComment（RedGreen FSM 仍只看用户 comment）。
  const retryComment = resolveEffectiveRetryComment({
    instance: ctx.instance,
    stageId: stage.id,
    userComment: runtime.retryComment ?? '',
  });
  if (retryComment) {
    sys += `\n\n用户修改意见：${retryComment}`;
  }
  if (options?.writeIntegrityRetry) {
    sys += `\n\n${WRITE_INTEGRITY_RETRY_SYSTEM_APPEND}`;
  }
  let userContent = await resolveInput(stage, runtime, panel);
  if (options?.writeIntegrityRetry) {
    userContent += `\n\n${WRITE_INTEGRITY_RETRY_USER_APPEND}`;
  }
  if (isImplStageId(stage.id)) {
    const gateImpl = await applyPreStageQualityGates(params, stage, ctx.stageIndex, 'before-impl', attempt);
    if (gateImpl === 'failed') {
      throw new StageAlreadyHandledError('pre-impl-quality-gate-failed');
    }
    const guarded = await executeImplWithHollowGuard(sys, userContent, (nextSys, nextUser) =>
      executeLlmText(stage.id, nextSys, nextUser, panel),
    );
    if (guarded.note) {
      runtime.outputs._implExecNote = guarded.note;
    }
    return guarded.text;
  }
  return executeLlmText(stage.id, sys, userContent, panel);
}
