import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { STAGE_INIT_NPM_WORKSPACE_ID } from '../disk-bootstrap/constants';
import { buildExecTimelineNodes } from '../webview/shared/execTimelineModel';
import type { MiniElement } from './webview-script-test-harness';
import {
  findElementContainingText,
  setupWebviewScriptRuntime,
} from './webview-script-test-harness';

function findDetailsBySummaryContains(root: MiniElement, text: string): MiniElement | null {
  const queue: MiniElement[] = [root];
  while (queue.length > 0) {
    const n = queue.shift()!;
    if (n.tagName === 'details') {
      const summary = n.children.find((c) => c.tagName === 'summary');
      if (summary && `${summary.textContent}${summary.children.map((c) => c.textContent).join('')}`.includes(text)) {
        return n;
      }
    }
    queue.push(...n.children);
  }
  return null;
}

test('buildExecTimelineNodes keeps decision stages top-level and groups others', () => {
  const nodes = buildExecTimelineNodes([
    { id: STAGE_INIT_NPM_WORKSPACE_ID, title: '初始化 npm', status: 'pending' },
    { id: 'stage_impl_a', title: '实现 A', status: 'pending' },
    { id: 'stage_impl_a_stagent_bundle_write', title: '落盘：实现 A', status: 'pending' },
    { id: 'stage_decide_arch', title: '全局架构决策', status: 'done', isDecisionStage: true },
    { id: 'stage_impl_b', title: '实现 B', status: 'pending' },
  ]);
  assert.equal(nodes.length, 3);
  assert.equal(nodes[0]?.type, 'segment-fold');
  assert.equal(nodes[1]?.type, 'decision');
  assert.equal(nodes[2]?.type, 'segment-fold');
  if (nodes[0]?.type === 'segment-fold') {
    assert.equal(nodes[0].stages.length, 3);
  }
  if (nodes[2]?.type === 'segment-fold') {
    assert.equal(nodes[2].stages.length, 1);
  }
});

test('exec timeline shows decision stages and folds non-decision segments', () => {
  const rt = setupWebviewScriptRuntime(true);
  const workflow = {
    id: 'wf_auto_fold',
    version: '2.0',
    meta: { title: 'fold', taskType: 'software', userInput: 'x', createdAt: new Date().toISOString() },
    stages: [
      {
        id: STAGE_INIT_NPM_WORKSPACE_ID,
        title: '初始化 npm 子项目（工作区根）',
        tool: 'code-runner',
      },
      { id: 'stage_impl_a', title: '实现模块 A', tool: 'llm-text' },
      {
        id: 'stage_impl_a_stagent_bundle_write',
        title: '落盘：实现模块 A',
        tool: 'file-write',
      },
      {
        id: 'stage_decide_arch',
        title: '全局架构决策',
        tool: 'llm-text',
        isDecisionStage: true,
      },
    ],
  };
  rt.send({ type: 'workflowGenerated', workflow, warnings: [] });
  rt.document.getElementById('view-exec')!.className = 'view active';
  rt.send({ type: 'stageStatusUpdate', stageId: STAGE_INIT_NPM_WORKSPACE_ID, status: 'done' });
  rt.send({ type: 'stageStatusUpdate', stageId: 'stage_decide_arch', status: 'done' });

  const timeline = rt.document.getElementById('timeline-exec')!;
  assert.ok(findElementContainingText(timeline, '全局架构决策'));
  assert.ok(findElementContainingText(timeline, '执行步骤（3）'));
  const segmentFold = findDetailsBySummaryContains(timeline, '执行步骤（3）');
  assert.ok(segmentFold);
  assert.equal(segmentFold!.open, false);
});

test('exec timeline auto-expands segment when a contained stage is running', () => {
  const rt = setupWebviewScriptRuntime(true);
  const workflow = {
    id: 'wf_auto_fold_open',
    version: '2.0',
    meta: { title: 'fold', taskType: 'software', userInput: 'x', createdAt: new Date().toISOString() },
    stages: [
      { id: 'stage_impl_a', title: '实现模块 A', tool: 'llm-text' },
      {
        id: 'stage_impl_a_stagent_bundle_write',
        title: '落盘：实现模块 A',
        tool: 'file-write',
      },
    ],
  };
  rt.send({ type: 'workflowGenerated', workflow, warnings: [] });
  rt.document.getElementById('view-exec')!.className = 'view active';
  rt.send({ type: 'stageStatusUpdate', stageId: 'stage_impl_a_stagent_bundle_write', status: 'running' });

  const timeline = rt.document.getElementById('timeline-exec')!;
  const segmentFold = findDetailsBySummaryContains(timeline, '执行步骤（2）');
  assert.ok(segmentFold);
  assert.equal(segmentFold!.open, true);
});
