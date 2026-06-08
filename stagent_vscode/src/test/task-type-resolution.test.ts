import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  AUTO_TASK_TYPE,
  buildTaskTypeClassificationInfo,
  buildTaskTypeOverrideWarning,
  isAutoTaskType,
  resolveGeneratedTaskType,
  workflowHasZoomOutStage,
} from '../TaskTypeResolution';
import { validateAndPrepareGeneratedWorkflow } from '../WorkflowEngineHelpers';
import type { WorkflowDefinition } from '../WorkflowDefinition';

test('isAutoTaskType treats empty and auto as auto', () => {
  assert.equal(isAutoTaskType(undefined), true);
  assert.equal(isAutoTaskType(''), true);
  assert.equal(isAutoTaskType(AUTO_TASK_TYPE), true);
  assert.equal(isAutoTaskType('software'), false);
});

test('resolveGeneratedTaskType prefers UI override over model meta', () => {
  assert.equal(resolveGeneratedTaskType('prototype', 'software'), 'software');
  assert.equal(resolveGeneratedTaskType('prototype', 'auto'), 'prototype');
  assert.equal(resolveGeneratedTaskType('prototype', ''), 'prototype');
});

test('resolveGeneratedTaskType falls back to other when meta invalid in auto mode', () => {
  assert.equal(resolveGeneratedTaskType('invalid-type', 'auto'), 'other');
  assert.equal(resolveGeneratedTaskType(undefined, 'auto'), 'other');
});

test('buildTaskTypeClassificationInfo explains auto model classification', () => {
  const info = buildTaskTypeClassificationInfo({
    uiTaskType: 'auto',
    modelTaskType: 'software',
    effectiveType: 'software',
    isGreenfield: true,
    hasZoomOutStage: false,
  });
  assert.equal(info.effectiveTaskType, 'software');
  assert.ok(info.rationaleLines.some((l) => l.includes('software')));
  assert.ok(info.rationaleLines.some((l) => l.includes('绿场') || l.includes('greenfield')));
});

test('buildTaskTypeClassificationInfo notes UI override and zoom-out', () => {
  const info = buildTaskTypeClassificationInfo({
    uiTaskType: 'prototype',
    modelTaskType: 'software',
    effectiveType: 'prototype',
    isGreenfield: false,
    hasZoomOutStage: true,
  });
  assert.ok(info.rationaleLines.some((l) => l.includes('prototype')));
  assert.ok(info.rationaleLines.some((l) => l.includes('stage_zoom_out')));
});

test('workflowHasZoomOutStage detects brownfield gate stage', () => {
  assert.equal(workflowHasZoomOutStage([{ id: 'stage_a' }, { id: 'stage_zoom_out' }]), true);
  assert.equal(workflowHasZoomOutStage([{ id: 'stage_a' }]), false);
});

test('buildTaskTypeOverrideWarning when UI overrides model suggestion', () => {
  const w = buildTaskTypeOverrideWarning('software', 'prototype', 'software');
  assert.ok(w?.includes('ui-override:software'));
  assert.ok(w?.includes('model-suggested:prototype'));
});

test('validateAndPrepareGeneratedWorkflow skips software pipeline for prototype meta', () => {
  const wf: WorkflowDefinition = {
    id: 'wf_proto',
    version: '2.0',
    meta: {
      title: 'p',
      taskType: 'prototype',
      userInput: 'python script',
      createdAt: new Date().toISOString(),
    },
    stages: [
      {
        id: 'stage_a',
        title: 'A',
        tool: 'llm-text',
        toolConfig: { type: 'llm-text', systemPrompt: 'x' },
        input: { sources: [], mergeStrategy: 'concat' },
        outputs: [{ key: 'main', format: 'text' }],
        pauseAfter: false,
      },
    ],
  };
  const result = validateAndPrepareGeneratedWorkflow(wf, 'prototype');
  assert.equal(result.errors.length, 0);
  assert.equal(result.workflow.stages.some((s) => s.id === 'stage_init_npm_workspace'), false);
});
