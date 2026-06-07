import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  buildTestWebviewL10nZh,
  findButtonByText,
  findElementContainingText,
  findExecTimelineItem,
  findInputByPlaceholder,
  setupWebviewScriptRuntime,
} from './webview-script-test-harness';

const l10nZh = buildTestWebviewL10nZh();

test('webview decision flow: approve branches to soft prompt then force approve postMessage', () => {
  const rt = setupWebviewScriptRuntime(true);
  const workflow = {
    id: 'wf_m8',
    version: '2.0',
    meta: { title: 'm8', taskType: 'software', userInput: 'x', createdAt: new Date().toISOString() },
    stages: [{ id: 'stage_decide_1', title: 'Decide 1', isDecisionStage: true }],
  };

  rt.send({ type: 'workflowGenerated', workflow, warnings: [] });
  rt.send({ type: 'stageOutputUpdate', stageId: 'stage_decide_1', content: '简短决策文本' });
  rt.send({ type: 'stageStatusUpdate', stageId: 'stage_decide_1', status: 'paused' });

  const pauseBar = rt.document.getElementById('pause-bar');
  assert.ok(pauseBar);
  assert.equal(pauseBar.style.display, 'flex', '暂停时应显示底栏（含批准/重试按钮）');
  assert.ok(pauseBar.classList.contains('is-visible'));
  const editor = rt.document.getElementById('decision-editor');
  assert.ok(editor, 'decision-editor should exist after pause render');
  editor.value = '## 决策文本（已人工修订）';
  const approveBtn = findButtonByText(pauseBar, l10nZh['stagent.webview.pause.decisionApprove']);
  approveBtn.onclick?.();
  assert.equal(
    rt.postMessages.some((m) => (m as { type?: string }).type === 'approveDecision'),
    false,
  );

  rt.postMessages.length = 0;
  const forceApproveBtn = findButtonByText(pauseBar, l10nZh['stagent.webview.pause.forceApprove']);
  forceApproveBtn.onclick?.();
  const approveMsg = rt.postMessages.find((m) => (m as { type?: string }).type === 'approveDecision') as
    | { stageId: string; decisionRecord: string }
    | undefined;
  assert.ok(approveMsg);
  assert.equal(approveMsg.stageId, 'stage_decide_1');
  assert.equal(approveMsg.decisionRecord, '## 决策文本（已人工修订）');
});

test('webview decision flow: retry button posts retry payload with comment', () => {
  const rt = setupWebviewScriptRuntime(true);
  const workflow = {
    id: 'wf_m8_retry',
    version: '2.0',
    meta: { title: 'm8 retry', taskType: 'software', userInput: 'x', createdAt: new Date().toISOString() },
    stages: [
      { id: 'stage_decide_prev', title: 'Prev Decide', isDecisionStage: true },
      { id: 'stage_decide_2', title: 'Decide 2', isDecisionStage: true },
    ],
  };

  rt.send({ type: 'workflowGenerated', workflow, warnings: [] });
  rt.send({ type: 'stageStatusUpdate', stageId: 'stage_decide_prev', status: 'done' });
  rt.send({ type: 'stageStatusUpdate', stageId: 'stage_decide_2', status: 'paused' });
  rt.send({ type: 'stageOutputUpdate', stageId: 'stage_decide_2', content: '## 决策内容' });
  rt.send({ type: 'stageStatusUpdate', stageId: 'stage_decide_2', status: 'paused' });

  const pauseBar = rt.document.getElementById('pause-bar');
  assert.ok(pauseBar);
  const retryInput = findInputByPlaceholder(pauseBar, '重试提示（可选）');
  retryInput.value = '请补充边界压力测试';
  const retryBtn = findButtonByText(pauseBar, '🔄 让 AI 重新生成');
  retryBtn.onclick?.();

  const retryMsg = rt.postMessages.find((m) => (m as { type?: string }).type === 'retry') as
    | { stageId: string; comment: string }
    | undefined;
  assert.ok(retryMsg);
  assert.equal(retryMsg.stageId, 'stage_decide_2');
  assert.equal(retryMsg.comment, '请补充边界压力测试');
});

test('webview decision flow: conflict banner shows and expands approved decision details', () => {
  const rt = setupWebviewScriptRuntime(true);
  const workflow = {
    id: 'wf_m8_conflict',
    version: '2.0',
    meta: { title: 'm8 conflict', taskType: 'software', userInput: 'x', createdAt: new Date().toISOString() },
    stages: [
      { id: 'stage_decide_a', title: 'Decide A', isDecisionStage: true },
      { id: 'stage_decide_b', title: 'Decide B', isDecisionStage: true },
      { id: 'stage_decide_c', title: 'Decide C', isDecisionStage: true },
    ],
  };

  rt.send({ type: 'workflowGenerated', workflow, warnings: [] });
  rt.send({ type: 'stageOutputUpdate', stageId: 'stage_decide_a', content: '## A 决策记录' });
  rt.send({ type: 'stageOutputUpdate', stageId: 'stage_decide_b', content: '## B 决策记录' });
  rt.send({ type: 'stageStatusUpdate', stageId: 'stage_decide_a', status: 'done' });
  rt.send({ type: 'stageStatusUpdate', stageId: 'stage_decide_b', status: 'done' });
  rt.send({ type: 'stageStatusUpdate', stageId: 'stage_decide_c', status: 'paused' });
  rt.send({ type: 'stageOutputUpdate', stageId: 'stage_decide_c', content: '## C 待审核' });
  rt.send({ type: 'stageStatusUpdate', stageId: 'stage_decide_c', status: 'paused' });

  const pauseBar = rt.document.getElementById('pause-bar');
  assert.ok(pauseBar);
  findElementContainingText(
    pauseBar,
    l10nZh['stagent.webview.pause.conflictBanner'].replace('{0}', '2'),
  );

  const viewBtn = findButtonByText(pauseBar, l10nZh['stagent.webview.pause.viewApproved']);
  viewBtn.onclick?.();

  const decideATitle = findElementContainingText(pauseBar, 'Decide A');
  assert.ok(decideATitle);
  const decideAContent = findElementContainingText(pauseBar, '## A 决策记录');
  assert.ok(decideAContent);
  const decideBContent = findElementContainingText(pauseBar, '## B 决策记录');
  assert.ok(decideBContent);
});

test('webview questionAfter: empty required answer blocks submit and shows validation banner', () => {
  const rt = setupWebviewScriptRuntime(true);
  const workflow = {
    id: 'wf_q_after',
    version: '2.0',
    meta: { title: 'q', taskType: 'auto', userInput: 'x', createdAt: new Date().toISOString() },
    stages: [
      {
        id: 'stage_impl',
        title: 'Impl',
        tool: 'llm-text',
        questionAfter: [
          { id: 'deploy_env', text: '部署环境', required: true },
          { id: 'notes', text: '备注', required: false },
        ],
      },
    ],
  };

  rt.send({ type: 'workflowGenerated', workflow, warnings: [] });
  rt.send({ type: 'startExecution', workflow });
  rt.send({ type: 'stageStatusUpdate', stageId: 'stage_impl', status: 'paused' });
  rt.send({
    type: 'stageQuestions',
    stageId: 'stage_impl',
    questions: workflow.stages[0].questionAfter,
  });

  const pauseBar = rt.document.getElementById('pause-bar');
  assert.ok(pauseBar);
  const submitBtn = findButtonByText(pauseBar, '提交答案并继续');
  submitBtn.onclick?.();

  assert.equal(
    rt.postMessages.some((m) => (m as { type?: string }).type === 'answerQuestions'),
    false,
  );
  const banner = pauseBar.querySelector('#question-validation-banner');
  assert.ok(banner);
  assert.notEqual(banner.style.display, 'none');
  assert.match(banner.textContent || '', /部署环境/);

  const deployInput = findInputByPlaceholder(pauseBar, '请输入答案');
  deployInput.value = '本地 Docker';
  submitBtn.onclick?.();
  const answerMsg = rt.postMessages.find((m) => (m as { type?: string }).type === 'answerQuestions') as
    | { stageId: string; answers: Record<string, string> }
    | undefined;
  assert.ok(answerMsg);
  assert.equal(answerMsg.stageId, 'stage_impl');
  assert.equal(answerMsg.answers.deploy_env, '本地 Docker');
});

test('exec timeline: click pins historical output while later stage streams', () => {
  const rt = setupWebviewScriptRuntime(true);
  const workflow = {
    id: 'wf_exec_pin',
    version: '2.0',
    meta: { title: 'pin', taskType: 'auto', userInput: 'x', createdAt: new Date().toISOString() },
    stages: [
      { id: 'stage_a', title: '阶段 A' },
      { id: 'stage_b', title: '阶段 B' },
    ],
  };

  rt.send({ type: 'workflowGenerated', workflow, warnings: [] });
  rt.send({ type: 'startExecution', workflow });
  rt.send({ type: 'stageStatusUpdate', stageId: 'stage_a', status: 'running' });
  rt.send({ type: 'stageOutputUpdate', stageId: 'stage_a', outputKey: 'out', content: '输出-A-完整' });
  rt.send({ type: 'stageStatusUpdate', stageId: 'stage_a', status: 'done' });
  rt.send({ type: 'stageStatusUpdate', stageId: 'stage_b', status: 'running' });
  rt.send({ type: 'streamChunk', stageId: 'stage_b', chunk: 'B-流式' });

  const timeline = rt.document.getElementById('timeline-exec')!;
  findExecTimelineItem(timeline, 'stage_a').onclick?.();

  const output = rt.document.getElementById('output')!;
  assert.equal(output.textContent, '输出-A-完整');

  rt.send({ type: 'streamChunk', stageId: 'stage_b', chunk: '-更多' });
  assert.equal(output.textContent, '输出-A-完整');

  const followBtn = rt.document.getElementById('btn-follow-live')!;
  assert.notEqual(followBtn.style.display, 'none');
  followBtn.onclick?.();
  assert.match(output.textContent || '', /B-流式/);
});
