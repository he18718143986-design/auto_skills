import { invokeLlmTextForStage } from './LlmTextInvokeStep';
import { persistLlmTextOutputs } from './LlmTextPersistStep';
import { scoreLlmTextConfidenceAndGates } from './LlmTextScoreStep';
import { LOG_PREVIEW_SHORT } from '../LogPreviewLimits';
import type { StageStepContext } from './StageStepContext';
import { readWriteOutputIntegrityMode } from './llm-persist/writeOutputIntegrity';
import { WriteOutputIntegrityMismatchError } from './llm-persist/writeOutputIntegrityAssess';
import { isStageAlreadyHandledError } from './StageControlSignals';
import {
  applyMultiFileBundleOutputs,
  fileOutputKeysForStage,
  isMultiFileBundleStage,
} from './llm-persist/multiFileBundleOutput';
import { parseDecisionArtifactsFromText } from '../commitment/parseDecisionArtifacts';
import {
  DECISION_ARTIFACTS_OUTPUT_KEY,
  PRIMARY_DECISION_OUTPUT_KEY,
} from '../WorkflowOutputKeys';

/** llm-text 工具全路径：LLM 调用 → 落盘/patch → quality/confidence/post-impl gates。 */
export async function runLlmTextStage(
  ctx: StageStepContext,
  attempt: number,
  instanceKey: string,
): Promise<void> {
  const { params, stage, runtime, panel } = ctx;
  const { debugLogLlmPreview, primaryOutputKey } = params;

  let text = await invokeLlmTextForStage(ctx, attempt, panel);
  debugLogLlmPreview?.(stage.id, attempt, {
    chars: text.length,
    head: text.slice(0, LOG_PREVIEW_SHORT),
    tail: text.slice(Math.max(0, text.length - LOG_PREVIEW_SHORT)),
  });

  const outKey = primaryOutputKey(stage);
  if (stage.isDecisionStage) {
    const parsed = parseDecisionArtifactsFromText(text);
    if (parsed.markdownBody) {
      text = parsed.markdownBody;
    }
    if (parsed.artifacts) {
      runtime.outputs[DECISION_ARTIFACTS_OUTPUT_KEY] = parsed.artifacts;
      for (const f of parsed.artifacts.files) {
        if (f.key?.trim() && f.content != null) {
          runtime.outputs[f.key.trim()] = String(f.content);
        }
      }
    }
    if (parsed.warnings.length > 0) {
      runtime.outputs._decisionArtifactsWarnings = parsed.warnings;
    }
    runtime.outputs[PRIMARY_DECISION_OUTPUT_KEY] = text;
  }
  if (isMultiFileBundleStage(stage)) {
    applyMultiFileBundleOutputs(runtime.outputs, text, fileOutputKeysForStage(stage));
    runtime.outputs[outKey] = String(runtime.outputs[outKey] ?? text);
  } else {
    runtime.outputs[outKey] = text;
  }

  try {
    await persistLlmTextOutputs(ctx, attempt, outKey, instanceKey, text);
  } catch (e) {
    if (
      e instanceof WriteOutputIntegrityMismatchError &&
      readWriteOutputIntegrityMode() === 'retry'
    ) {
      text = await invokeLlmTextForStage(ctx, attempt, panel, { writeIntegrityRetry: true });
      debugLogLlmPreview?.(stage.id, attempt, {
        chars: text.length,
        head: text.slice(0, LOG_PREVIEW_SHORT),
        tail: text.slice(Math.max(0, text.length - LOG_PREVIEW_SHORT)),
      });
      if (isMultiFileBundleStage(stage)) {
        applyMultiFileBundleOutputs(runtime.outputs, text, fileOutputKeysForStage(stage));
        runtime.outputs[outKey] = String(runtime.outputs[outKey] ?? text);
      } else {
        runtime.outputs[outKey] = text;
      }
      try {
        await persistLlmTextOutputs(ctx, attempt, outKey, instanceKey, text, {
          integrityFailClosed: true,
        });
      } catch (inner) {
        if (isStageAlreadyHandledError(inner)) {
          throw inner;
        }
        throw inner;
      }
      params.postMessage(panel, {
        type: 'streamChunk',
        stageId: stage.id,
        chunk: '✅ 落盘完整性已自动重试纠正。\n',
      });
    } else if (isStageAlreadyHandledError(e)) {
      throw e;
    } else {
      throw e;
    }
  }
  await scoreLlmTextConfidenceAndGates(ctx, attempt, instanceKey, panel);
}
