import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { LOG_PREVIEW_INPUT_SUMMARY_FALLBACK } from '../LogPreviewLimits';
import { StageInputResolutionService } from '../StageInputResolutionService';
import type { LlmClient } from '../LlmClient';
import type { WorkflowEnginePathHost } from '../WorkflowEnginePathHost';

test('summarizeForInput warns and truncates when llm returns undefined', async () => {
  const warnings: string[] = [];
  const debugEvents: string[] = [];
  const svc = new StageInputResolutionService({
    getInstance: () => undefined,
    getPathHost: () => ({}) as WorkflowEnginePathHost,
    llm: { summarizeText: async () => undefined } as Pick<LlmClient, 'summarizeText'> as LlmClient,
    warn: (m) => warnings.push(m),
    debugLog: (_stageId, event) => debugEvents.push(event),
    postMessage: () => {},
    getWorkspaceRootAbsolute: () => undefined,
  });
  const raw = 'x'.repeat(2000);
  const out = await svc.summarizeForInput('st1', 'lbl', raw);
  assert.equal(out.length, LOG_PREVIEW_INPUT_SUMMARY_FALLBACK);
  assert.ok(warnings.some((w) => w.includes('input-summary-failed')));
  assert.ok(debugEvents.includes('input_summary_fallback'));
});
