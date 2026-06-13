import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { buildWorkflowWebviewHtml } from '../WebviewPanel';
import {
  assertPauseBarVisible,
  bootWorkflowOnExec,
  countButtons,
  findButtonByText,
  findByClassPart,
  findElementContainingText,
  findExecTimelineItem,
  findFirstByTag,
  getElementTreeText,
  setupWebviewScriptRuntime,
} from './webview-script-test-harness';

test('webview HTML: pause-bar must not use inline display:none (regression)', () => {
  const html = buildWorkflowWebviewHtml({ cspSource: 'vscode-test' } as never);
  const pauseBarTag = html.match(/<div id="pause-bar"[^>]*>/)?.[0] ?? '';
  assert.ok(pauseBarTag.length > 0);
  assert.equal(/style="display:\s*none"/.test(pauseBarTag), false, pauseBarTag);
  assert.match(html, /id="exec-error-dock"/);
  assert.match(html, /id="gen-actions"/);
  assert.match(html, /id="btn-polish-apply"[^>]*data-i18n-key="stagent\.webview\.main\.btnGenWorkflow"/);
  assert.match(html, /id="polish-actions"/);
});

test('normal pause: pause-bar visible with approve/retry in dock when bar started hidden', () => {
  const rt = setupWebviewScriptRuntime(true);
  const workflow = {
    id: 'wf_pause_normal',
    version: '2.0',
    meta: { title: 'pause', taskType: 'auto', userInput: 'x', createdAt: new Date().toISOString() },
    stages: [{ id: 'stage_impl', title: '实现阶段', tool: 'llm-text', pauseAfter: true }],
  };
  bootWorkflowOnExec(rt, workflow);
  rt.send({ type: 'stageStatusUpdate', stageId: 'stage_impl', status: 'paused' });

  assertPauseBarVisible(rt.document);
  const pauseBar = rt.document.getElementById('pause-bar')!;
  findButtonByText(pauseBar, '🔄 修改后重新生成');
  findButtonByText(pauseBar, '✅ 批准，继续');
  assert.match(rt.document.getElementById('output-label')!.textContent ?? '', /暂停：实现阶段/);
});

test('decision pause: Global Architecture title, decision editor, dock approve/retry', () => {
  const rt = setupWebviewScriptRuntime(true);
  const workflow = {
    id: 'wf_pause_decision',
    version: '2.0',
    meta: { title: 'decision', taskType: 'software', userInput: 'x', createdAt: new Date().toISOString() },
    stages: [
      {
        id: 'stage_decide_arch',
        title: 'Global Architecture Decision',
        isDecisionStage: true,
        tool: 'llm-text',
        outputs: [{ key: 'decisionRecord' }],
      },
    ],
  };
  bootWorkflowOnExec(rt, workflow);
  rt.send({ type: 'stageStatusUpdate', stageId: 'stage_decide_arch', status: 'paused' });
  rt.send({ type: 'stageOutputUpdate', stageId: 'stage_decide_arch', content: '## 架构决策草案' });
  rt.send({ type: 'stageStatusUpdate', stageId: 'stage_decide_arch', status: 'paused' });

  assertPauseBarVisible(rt.document);
  const pauseBar = rt.document.getElementById('pause-bar')!;
  findFirstByTag(pauseBar, 'textarea');
  findButtonByText(pauseBar, '🔄 让 AI 重新生成');
  findButtonByText(pauseBar, '✅ 批准此决策');
  const label = rt.document.getElementById('output-label')!.textContent ?? '';
  assert.match(label, /决策审核：Global Architecture Decision/);
  assert.equal(rt.document.getElementById('output')!.style.display, 'none');
});

test('decision soft-prompt: force approve button lives in pause-bar dock', () => {
  const rt = setupWebviewScriptRuntime(true);
  rt.document.getElementById('pause-bar')!.style.display = 'none';
  const workflow = {
    id: 'wf_force_approve',
    version: '2.0',
    meta: { title: 'm8', taskType: 'software', userInput: 'x', createdAt: new Date().toISOString() },
    stages: [{ id: 'stage_decide_1', title: 'Decide 1', isDecisionStage: true }],
  };
  rt.send({ type: 'workflowGenerated', workflow, warnings: [] });
  rt.send({ type: 'stageStatusUpdate', stageId: 'stage_decide_1', status: 'paused' });
  rt.send({ type: 'stageOutputUpdate', stageId: 'stage_decide_1', content: '简短决策文本' });
  rt.send({ type: 'stageStatusUpdate', stageId: 'stage_decide_1', status: 'paused' });

  assertPauseBarVisible(rt.document);
  const pauseBar = rt.document.getElementById('pause-bar')!;
  const dock = findByClassPart(pauseBar, 'pause-bar-dock')!;
  findButtonByText(pauseBar, '✅ 批准此决策').onclick?.();
  const forceInDock = findButtonByText(dock, '忽略，直接批准');
  assert.equal(forceInDock.style.display, '', 'force approve should appear in dock after soft prompt');
});

test('stageError: clears dock and banner when stage leaves error (e.g. retry)', () => {
  const rt = setupWebviewScriptRuntime(true);
  const workflow = {
    id: 'wf_stage_err_retry',
    version: '2.0',
    meta: { title: 'err', taskType: 'auto', userInput: 'x', createdAt: new Date().toISOString() },
    stages: [{ id: 'stage_init_npm_workspace', title: 'npm init', tool: 'code-runner' }],
  };
  rt.send({ type: 'workflowGenerated', workflow, warnings: [] });
  rt.document.getElementById('view-exec')!.className = 'view active';
  rt.send({
    type: 'stageError',
    stageId: 'stage_init_npm_workspace',
    errorType: 'tool-execution-failed',
    error: 'tool-execution-failed: code-runner exitCode=127',
  });
  const errorDock = rt.document.getElementById('exec-error-dock')!;
  assert.equal(errorDock.style.display, 'flex');

  rt.send({ type: 'stageStatusUpdate', stageId: 'stage_init_npm_workspace', status: 'running' });

  assert.equal(errorDock.style.display, 'none');
  assert.equal(errorDock.innerHTML, '');
  assert.equal(rt.document.getElementById('fail-banner')!.querySelector('.error-card'), null);
});

test('timeline: done stage stays checkmark when stale stageError arrives', () => {
  const rt = setupWebviewScriptRuntime(true);
  const workflow = {
    id: 'wf_stale_err',
    version: '2.0',
    meta: { title: 'stale', taskType: 'auto', userInput: 'x', createdAt: new Date().toISOString() },
    stages: [{ id: 'stage_impl', title: '实现', tool: 'llm-text' }],
  };
  bootWorkflowOnExec(rt, workflow);
  rt.send({ type: 'stageStatusUpdate', stageId: 'stage_impl', status: 'done' });
  rt.send({
    type: 'stageError',
    stageId: 'stage_impl',
    errorType: 'tool-execution-failed',
    error: 'stale error from recovery',
  });
  const timeline = rt.document.getElementById('timeline-exec')!;
  const row = findExecTimelineItem(timeline, 'stage_impl');
  const rowText = getElementTreeText(row);
  assert.match(rowText, /✅/);
  assert.doesNotMatch(rowText, /❌/);
});

test('timeline: done stage stays checkmark when late stageStatusUpdate error is rejected', () => {
  const rt = setupWebviewScriptRuntime(true);
  const workflow = {
    id: 'wf_late_err_status',
    version: '2.0',
    meta: { title: 'late', taskType: 'auto', userInput: 'x', createdAt: new Date().toISOString() },
    stages: [{ id: 'stage_impl', title: '实现', tool: 'llm-text' }],
  };
  bootWorkflowOnExec(rt, workflow);
  rt.send({ type: 'stageStatusUpdate', stageId: 'stage_impl', status: 'done' });
  rt.send({ type: 'stageStatusUpdate', stageId: 'stage_impl', status: 'error' });
  const timeline = rt.document.getElementById('timeline-exec')!;
  const row = findExecTimelineItem(timeline, 'stage_impl');
  const rowText = getElementTreeText(row);
  assert.match(rowText, /✅/);
  assert.doesNotMatch(rowText, /❌/);
});

test('stageError: primary actions render in exec-error-dock not fail-banner', () => {
  const rt = setupWebviewScriptRuntime(true);
  const workflow = {
    id: 'wf_stage_err',
    version: '2.0',
    meta: { title: 'err', taskType: 'auto', userInput: 'x', createdAt: new Date().toISOString() },
    stages: [{ id: 'stage_impl', title: '实现', tool: 'llm-text' }],
  };
  rt.send({ type: 'workflowGenerated', workflow, warnings: [] });
  rt.document.getElementById('view-exec')!.className = 'view active';
  rt.send({
    type: 'stageError',
    stageId: 'stage_impl',
    errorType: 'llm-timeout',
    error: 'LLM 超时',
  });

  const failBanner = rt.document.getElementById('fail-banner')!;
  assert.equal(countButtons(failBanner), 0, 'fail-banner should not host action buttons');
  const errorDock = rt.document.getElementById('exec-error-dock')!;
  assert.equal(errorDock.style.display, 'flex');
  assert.ok(countButtons(errorDock) >= 1);
  findButtonByText(errorDock, '重试');
  assert.notEqual(rt.document.getElementById('pause-bar')!.style.display, 'flex');
});

test('workflowFailed on input: gen-actions dock with regenerate and edit message', () => {
  const rt = setupWebviewScriptRuntime(true);
  rt.document.getElementById('task-workspace-path')!.value = '/tmp/ws';
  rt.document.getElementById('user-input')!.value = '需求文本';
  rt.document.getElementById('btn-gen')!.onclick?.();
  rt.send({ type: 'workflowFailed', reason: '解析失败' });

  assert.equal(rt.document.getElementById('gen-actions')!.style.display, 'flex');
  assert.equal(rt.document.getElementById('input-actions')!.style.display, 'none');
  assert.ok(rt.document.getElementById('composer-dock')!.className.includes('gen-error-mode'));
  assert.ok(rt.document.getElementById('btn-regenerate'));
  assert.ok(rt.document.getElementById('btn-edit-message'));
  rt.document.getElementById('btn-regenerate')!.onclick?.();
  assert.ok(rt.postMessages.some((m) => (m as { type?: string }).type === 'generateWorkflow'));
});

test('polish complete: dock shows 生成工作流 and starts clarify on click', () => {
  const rt = setupWebviewScriptRuntime(true);
  rt.document.getElementById('user-input')!.value = '口语草稿';
  rt.send({ type: 'taskWorkspacePathPicked', path: '/tmp/ws' });
  rt.document.getElementById('btn-toggle-polish-tools')!.onclick?.();
  rt.document.getElementById('btn-polish')!.onclick?.();
  rt.send({ type: 'userTaskPolished', text: '规范任务', polishedAt: new Date().toISOString() });

  assert.equal(rt.document.getElementById('polish-actions')!.style.display, 'flex');
  const polishApply = rt.document.getElementById('btn-polish-apply')!;
  assert.equal(polishApply.disabled, false);
  polishApply.onclick?.();
  assert.ok(rt.postMessages.some((m) => (m as { type?: string }).type === 'clarifyStart'));
  assert.equal(rt.document.getElementById('gen-status-panel')!.style.display, 'flex');
});

test('before-questions: pause-bar visible with submit in dock', () => {
  const rt = setupWebviewScriptRuntime(true);
  const workflow = {
    id: 'wf_before_q',
    version: '2.0',
    meta: { title: 'q', taskType: 'auto', userInput: 'x', createdAt: new Date().toISOString() },
    stages: [
      {
        id: 'stage_before',
        title: '前置',
        tool: 'llm-text',
        questionBefore: [{ id: 'q1', text: '确认范围?', required: true }],
      },
    ],
  };
  bootWorkflowOnExec(rt, workflow);
  rt.send({
    type: 'stageQuestionsBefore',
    stageId: 'stage_before',
    questions: workflow.stages[0].questionBefore,
  });
  rt.send({ type: 'stageStatusUpdate', stageId: 'stage_before', status: 'waiting-questions' });

  assertPauseBarVisible(rt.document);
  findButtonByText(rt.document.getElementById('pause-bar')!, '开始执行');
});

test('stageError: flutter exitCode=127 shows environment copy and weakened retry', () => {
  const rt = setupWebviewScriptRuntime(true);
  const workflow = {
    id: 'wf_flutter_127',
    version: '2.0',
    meta: { title: 'flutter', taskType: 'auto', userInput: 'x', createdAt: new Date().toISOString() },
    stages: [{ id: 'stage_test_run_chat_ui', title: 'Flutter test', tool: 'code-runner' }],
  };
  rt.send({ type: 'workflowGenerated', workflow, warnings: [] });
  rt.document.getElementById('view-exec')!.className = 'view active';
  rt.send({
    type: 'stageError',
    stageId: 'stage_test_run_chat_ui',
    errorType: 'tool-execution-failed',
    error: 'tool-execution-failed: code-runner exitCode=127',
    userTitle: '无法运行：未找到 flutter',
    userBody: '电脑找不到「flutter」命令。可能尚未安装，或安装后需要重启 VS Code。',
    userCategory: 'environment',
    exitCode: 127,
    weakenRetry: true,
    playbookSteps: [
      '安装 flutter，并确保已加入 PATH。',
      '安装后重启 VS Code，或从终端用 `code .` 启动。',
      '在工具可用之前，反复重试通常无效。',
    ],
  });

  const failBanner = rt.document.getElementById('fail-banner')!;
  const card = findByClassPart(failBanner, 'error-card');
  assert.ok(card, 'error card should render in fail-banner');
  const cardText = getElementTreeText(card!);
  assert.match(cardText, /flutter/);
  assert.match(cardText, /环境问题/);
  assert.match(cardText, /技术详情/);
  const errorDock = rt.document.getElementById('exec-error-dock')!;
  findButtonByText(errorDock, '仍要重试');
  findButtonByText(errorDock, '查看输出');
});

test('stageError: recovery replay renders card when stage status already error', () => {
  const rt = setupWebviewScriptRuntime(true);
  const workflow = {
    id: 'wf_recover_127',
    version: '2.0',
    meta: { title: 'recover', taskType: 'auto', userInput: 'x', createdAt: new Date().toISOString() },
    stages: [{ id: 'stage_test_run_chat_ui', title: 'Flutter test', tool: 'code-runner' }],
  };
  rt.send({ type: 'workflowGenerated', workflow, warnings: [] });
  rt.document.getElementById('view-exec')!.className = 'view active';
  rt.send({
    type: 'instanceResumed',
    resync: true,
    instanceKey: 'key-1',
    workflow,
    instanceStatus: 'failed',
    failedStageId: 'stage_test_run_chat_ui',
    failedSummary: {
      error: 'tool-execution-failed: code-runner exitCode=127',
      errorType: 'tool-execution-failed',
    },
    stageStatuses: { stage_test_run_chat_ui: 'error' },
  });
  rt.send({
    type: 'stageError',
    instanceKey: 'key-1',
    stageId: 'stage_test_run_chat_ui',
    errorType: 'tool-execution-failed',
    error: 'tool-execution-failed: code-runner exitCode=127',
    userTitle: '无法运行：未找到 flutter',
    userBody: '电脑找不到「flutter」命令。可能尚未安装，或安装后需要重启 VS Code。',
    userCategory: 'environment',
    exitCode: 127,
    weakenRetry: true,
  });

  const failBanner = rt.document.getElementById('fail-banner')!;
  const card = findByClassPart(failBanner, 'error-card');
  assert.ok(card, 'recovery replay should render enriched error card');
  assert.match(getElementTreeText(card!), /flutter/);
  findButtonByText(rt.document.getElementById('exec-error-dock')!, '仍要重试');
});

test('stageError: exitCode=1 code failure shows Fix code primary action', () => {
  const rt = setupWebviewScriptRuntime(true);
  const workflow = {
    id: 'wf_code_fail',
    version: '2.0',
    meta: { title: 'integration', taskType: 'auto', userInput: 'x', createdAt: new Date().toISOString() },
    stages: [{ id: 'stage_test_run_chat_integration', title: 'Integration test', tool: 'code-runner' }],
  };
  rt.send({ type: 'workflowGenerated', workflow, warnings: [] });
  rt.document.getElementById('view-exec')!.className = 'view active';
  rt.send({
    type: 'stageError',
    stageId: 'stage_test_run_chat_integration',
    errorType: 'tool-execution-failed',
    error: 'tool-execution-failed: code-runner exitCode=1',
    userTitle: 'Test failed',
    userBody: 'Import or assertion error in integration test.',
    userCategory: 'code',
    exitCode: 1,
    weakenRetry: false,
  });

  const errorDock = rt.document.getElementById('exec-error-dock')!;
  findButtonByText(errorDock, '修复代码');
  findButtonByText(errorDock, '重试');
});
