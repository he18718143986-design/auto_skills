import './install-vscode-stub';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import type {
  BackendMessage,
  Stage,
  StageRuntime,
  StageStatus,
  WorkflowDefinition,
  WorkflowInstance,
} from '../WorkflowDefinition';
import type { Artifact } from '../ArtifactTypes';
import type { HitlCoordinatorHost } from '../hitl/HitlCoordinatorHost';
import { enforceRetryLimitOrReject } from '../hitl/RetryLimitGate';
import { handleApproveDecision } from '../hitl/HitlApproveDecision';
import { handleRetry } from '../hitl/HitlRetry';
import { evaluateApproveDecisionLintOrReject } from '../hitl/DecisionLintGate';
import { handleAnswerQuestionsBefore } from '../hitl/HitlQuestionsBefore';
import { handleAnswerQuestions } from '../hitl/HitlQuestionsAfter';
import { ERROR_TYPE_RETRY_LIMIT_EXCEEDED } from '../WorkflowStageErrorHelpers';
import { PRIMARY_DECISION_OUTPUT_KEY } from '../WorkflowOutputKeys';

/* ------------------------------------------------------------------ *
 * HITL 安全闸门状态机测试骨架
 * ------------------------------------------------------------------
 * 覆盖两个核心安全闸门：
 *  - RetryLimitGate.enforceRetryLimitOrReject —— 手动重试上限（防无限重试）
 *  - HitlApproveDecision.handleApproveDecision —— 决策批准守卫 + 状态转移
 *
 * 设计要点：用一个记录型假 `HitlCoordinatorHost`（见 makeHost）捕获所有副作用，
 * 对「输入状态 → 是否放行 / 产生哪些转移与副作用」做断言。新增 HITL 模块
 * （HitlRetry / ArtifactRollback / DecisionLintGate 等）可复用此处的假对象骨架。
 * ------------------------------------------------------------------ */

interface HostCalls {
  messages: BackendMessage[];
  userActions: Array<{ kind: string; detail: Record<string, unknown> }>;
  rejections: Array<{ stageId: string; reason: string }>;
  warns: string[];
  saved: number;
  milestones: number;
  executed: number;
  bumped: number;
}

interface MakeHostOptions {
  instance?: WorkflowInstance;
  ensureInstanceBound?: boolean;
  maxManualStageRetries?: number;
  workspaceRoot?: string;
  decisionLintVscodeDefault?: boolean;
}

function makeHost(opts: MakeHostOptions = {}): { host: HitlCoordinatorHost; calls: HostCalls } {
  const calls: HostCalls = {
    messages: [],
    userActions: [],
    rejections: [],
    warns: [],
    saved: 0,
    milestones: 0,
    executed: 0,
    bumped: 0,
  };
  const instance = opts.instance;
  const host: HitlCoordinatorHost = {
    bindPanel: () => {},
    getInstance: () => instance,
    postMessage: (_p, msg) => {
      calls.messages.push(msg);
    },
    logUserAction: (kind, detail) => {
      calls.userActions.push({ kind, detail });
    },
    markStageArtifactsApproved: () => {},
    scheduleSave: () => {
      calls.saved += 1;
    },
    persistMilestone: () => {
      calls.milestones += 1;
    },
    executeNextStage: async () => {
      calls.executed += 1;
    },
    ensureInstanceBound: () => opts.ensureInstanceBound ?? true,
    rejectApproveDecision: (_p, stageId, reason) => {
      calls.rejections.push({ stageId, reason });
    },
    isDecisionContentLintVscodeDefault: () => opts.decisionLintVscodeDefault ?? true,
    isContractCommitmentsEnabled: () => false,
    getMaxManualStageRetries: () => opts.maxManualStageRetries ?? 3,
    getWorkspaceRootAbsolute: () => opts.workspaceRoot,
    debugLog: () => {},
    warn: (message) => {
      calls.warns.push(message);
    },
    error: (message) => {
      calls.warns.push(message);
    },
    bumpCurrentStageIndex: () => {
      calls.bumped += 1;
      if (instance) {
        instance.currentStageIndex += 1;
      }
    },
    setCurrentStageIndex: (i) => {
      if (instance) {
        instance.currentStageIndex = i;
      }
    },
    setInstanceStatus: (s) => {
      if (instance) {
        instance.status = s;
      }
    },
  };
  return { host, calls };
}

const PANEL = {} as never;

/** 单个决策阶段实例；status 控制 runtime 状态机入口。 */
function decisionInstance(
  status: StageStatus,
  options?: { isDecisionStage?: boolean; enableLint?: boolean; outputs?: Record<string, unknown> },
): WorkflowInstance {
  const stage: Stage = {
    id: 'stage_decision',
    title: '决策',
    tool: 'llm-text',
    toolConfig: { type: 'llm-text', systemPrompt: 'decide' },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'decision', format: 'text' }],
    pauseAfter: true,
    isDecisionStage: options?.isDecisionStage ?? true,
  };
  const rt: StageRuntime = {
    stageId: stage.id,
    status,
    outputs: options?.outputs ?? { decision: 'draft' },
    retryCount: 0,
  };
  return {
    definition: {
      id: 'wf',
      version: '2.0',
      meta: { title: 't', taskType: 'software', userInput: '', createdAt: '' },
      stages: [stage],
      globalConfig:
        options?.enableLint === undefined
          ? undefined
          : { enableDecisionContentLint: options.enableLint },
    },
    currentStageIndex: 0,
    stageRuntimes: [rt],
    status: 'running',
  };
}

/** 单非决策阶段实例（用于非决策重试与边界）。 */
function nonDecisionInstance(status: StageStatus, retryCount = 0): WorkflowInstance {
  const stage: Stage = {
    id: 'stage_impl',
    title: '实现',
    tool: 'llm-text',
    toolConfig: { type: 'llm-text', systemPrompt: 'impl' },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'implCode', format: 'text' }],
    pauseAfter: true,
  };
  return {
    definition: {
      id: 'wf',
      version: '2.0',
      meta: { title: 't', taskType: 'software', userInput: '', createdAt: '' },
      stages: [stage],
    },
    currentStageIndex: 0,
    stageRuntimes: [{ stageId: stage.id, status, outputs: { implCode: 'bad' }, retryCount }],
    status: 'running',
  };
}

/**
 * 决策阶段 + 下游消费阶段 + 无关阶段（用于级联重置）。
 * stage_downstream 通过 stage-output 消费决策主输出 → 应被 collectDecisionRetryResets 重置；
 * stage_independent 无依赖 → 应保持不变（验证选择性重置）。
 */
function decisionWithDownstreamInstance(
  instanceStatus: WorkflowInstance['status'],
  artifactRegistry?: Artifact[],
): WorkflowInstance {
  const decision: Stage = {
    id: 'stage_decision',
    title: '决策',
    tool: 'llm-text',
    toolConfig: { type: 'llm-text', systemPrompt: 'decide' },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'decision', format: 'text' }],
    pauseAfter: true,
    isDecisionStage: true,
  };
  const downstream: Stage = {
    id: 'stage_downstream',
    title: '下游',
    tool: 'llm-text',
    toolConfig: { type: 'llm-text', systemPrompt: 'use decision' },
    input: {
      sources: [
        { type: 'stage-output', stageId: 'stage_decision', outputKey: PRIMARY_DECISION_OUTPUT_KEY },
      ],
      mergeStrategy: 'concat',
    },
    outputs: [{ key: 'downstreamOut', format: 'text' }],
    pauseAfter: false,
  };
  const independent: Stage = {
    id: 'stage_independent',
    title: '无关',
    tool: 'llm-text',
    toolConfig: { type: 'llm-text', systemPrompt: 'independent' },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'indep', format: 'text' }],
    pauseAfter: false,
  };
  return {
    definition: {
      id: 'wf',
      version: '2.0',
      meta: { title: 't', taskType: 'software', userInput: '', createdAt: '' },
      stages: [decision, downstream, independent],
    },
    currentStageIndex: 2,
    stageRuntimes: [
      {
        stageId: 'stage_decision',
        status: 'done',
        outputs: { decision: 'old', [PRIMARY_DECISION_OUTPUT_KEY]: 'old' },
        approvedDecisionRecord: 'old',
        retryCount: 0,
      },
      { stageId: 'stage_downstream', status: 'done', outputs: { downstreamOut: 'x' }, retryCount: 0 },
      { stageId: 'stage_independent', status: 'done', outputs: { indep: 'y' }, retryCount: 0 },
    ],
    status: instanceStatus,
    artifactRegistry,
  };
}

/** 单阶段实例（含 questionBefore，必答 q1）。非决策 → adaptive grill 恒为 false（批量校验路径）。 */
function questionBeforeInstance(status: StageStatus, currentStageIndex = 0): WorkflowInstance {
  const stage: Stage = {
    id: 'stage_q',
    title: '追问前',
    tool: 'llm-text',
    toolConfig: { type: 'llm-text', systemPrompt: 'x' },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'out', format: 'text' }],
    pauseAfter: true,
    questionBefore: [{ id: 'q1', text: '关键约束？', required: true }],
  };
  return {
    definition: {
      id: 'wf',
      version: '2.0',
      meta: { title: 't', taskType: 'software', userInput: '', createdAt: '' },
      stages: [stage],
    },
    currentStageIndex,
    stageRuntimes: [
      { stageId: 'stage_q', status, outputs: {}, retryCount: 0, questionBeforeAnswers: {} },
    ],
    status: 'running',
  };
}

/**
 * 决策阶段（含 2 个必答 questionBefore）+ 2 个下游引用 → isContractNode=true。
 * 在 stub 配置下 readGrillAdaptiveModeForStage 确定性返回 true（adaptive grill 分支）。
 */
function adaptiveDecisionQuestionBeforeInstance(): WorkflowInstance {
  const decision: Stage = {
    id: 'stage_decision',
    title: '决策',
    tool: 'llm-text',
    toolConfig: { type: 'llm-text', systemPrompt: 'decide' },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'decision', format: 'text' }],
    pauseAfter: true,
    isDecisionStage: true,
    questionBefore: [
      { id: 'q1', text: '问题一？', required: true },
      { id: 'q2', text: '问题二？', required: true },
    ],
  };
  const consumer = (id: string): Stage => ({
    id,
    title: id,
    tool: 'llm-text',
    toolConfig: { type: 'llm-text', systemPrompt: 'use' },
    input: {
      sources: [{ type: 'stage-output', stageId: 'stage_decision' }],
      mergeStrategy: 'concat',
    },
    outputs: [{ key: 'out', format: 'text' }],
    pauseAfter: false,
  });
  return {
    definition: {
      id: 'wf',
      version: '2.0',
      meta: { title: 't', taskType: 'software', userInput: '', createdAt: '' },
      stages: [decision, consumer('stage_c1'), consumer('stage_c2')],
    },
    currentStageIndex: 0,
    stageRuntimes: [
      { stageId: 'stage_decision', status: 'waiting-questions', outputs: {}, retryCount: 0, questionBeforeAnswers: {} },
      { stageId: 'stage_c1', status: 'pending', outputs: {}, retryCount: 0 },
      { stageId: 'stage_c2', status: 'pending', outputs: {}, retryCount: 0 },
    ],
    status: 'running',
  };
}

/** 单阶段实例（含 questionAfter，必答 qa）。 */
function questionAfterInstance(status: StageStatus): WorkflowInstance {
  const stage: Stage = {
    id: 'stage_q',
    title: '追问后',
    tool: 'llm-text',
    toolConfig: { type: 'llm-text', systemPrompt: 'x' },
    input: { sources: [], mergeStrategy: 'concat' },
    outputs: [{ key: 'out', format: 'text' }],
    pauseAfter: true,
    questionAfter: [{ id: 'qa', text: '验收确认？', required: true }],
  };
  return {
    definition: {
      id: 'wf',
      version: '2.0',
      meta: { title: 't', taskType: 'software', userInput: '', createdAt: '' },
      stages: [stage],
    },
    currentStageIndex: 0,
    stageRuntimes: [{ stageId: 'stage_q', status, outputs: { out: 'draft' }, retryCount: 0 }],
    status: 'running',
  };
}

/** 最小 WorkflowDefinition（DecisionLintGate 仅读 globalConfig）。 */
function lintDefinition(enableLint?: boolean): WorkflowDefinition {
  return {
    id: 'wf',
    version: '2.0',
    meta: { title: 't', taskType: 'software', userInput: '', createdAt: '' },
    stages: [],
    globalConfig: enableLint === undefined ? undefined : { enableDecisionContentLint: enableLint },
  };
}

/** 构造一个属于下游阶段、落盘可回滚的产物（existedBefore=true）。 */
function downstreamArtifact(filePath: string, priorContent: string): Artifact {
  return {
    stageId: 'stage_downstream',
    outputKey: 'downstreamOut',
    filePath,
    state: 'persisted',
    checksum: 'deadbeef',
    createdAt: new Date().toISOString(),
    existedBefore: true,
    priorContent,
    stateHistory: [{ state: 'persisted', at: new Date().toISOString(), reason: 'file-write' }],
  };
}

/* ============================ RetryLimitGate ============================ */

describe('RetryLimitGate.enforceRetryLimitOrReject — 重试上限状态机', () => {
  it('低于上限：放行且无副作用', () => {
    const { host, calls } = makeHost({ maxManualStageRetries: 3 });
    for (const retryCount of [0, 1, 2]) {
      assert.equal(enforceRetryLimitOrReject(host, PANEL, 'stage_x', retryCount), true);
    }
    assert.equal(calls.userActions.length, 0);
    assert.equal(calls.messages.length, 0);
  });

  it('达到上限边界（retryCount === max）：拒绝并上报 retry-limit-exceeded', () => {
    const { host, calls } = makeHost({ maxManualStageRetries: 3 });
    assert.equal(enforceRetryLimitOrReject(host, PANEL, 'stage_x', 3), false);

    const action = calls.userActions.find((a) => a.kind === 'retry_rejected');
    assert.ok(action, '应记录 retry_rejected 用户行为');
    assert.equal(action!.detail.reason, ERROR_TYPE_RETRY_LIMIT_EXCEEDED);

    const stageError = calls.messages.find((m) => m.type === 'stageError');
    assert.ok(stageError, '应推送 stageError');
    assert.equal(
      (stageError as { errorType?: string }).errorType,
      ERROR_TYPE_RETRY_LIMIT_EXCEEDED,
    );
  });

  it('超过上限：拒绝', () => {
    const { host } = makeHost({ maxManualStageRetries: 3 });
    assert.equal(enforceRetryLimitOrReject(host, PANEL, 'stage_x', 4), false);
  });

  it('非法上限被规范化为最小值 1', () => {
    const { host } = makeHost({ maxManualStageRetries: 0 });
    assert.equal(enforceRetryLimitOrReject(host, PANEL, 'stage_x', 0), true);
    assert.equal(enforceRetryLimitOrReject(host, PANEL, 'stage_x', 1), false);
  });
});

/* ========================= HitlApproveDecision ========================= */

describe('HitlApproveDecision.handleApproveDecision — 决策批准状态机', () => {
  it('实例未绑定：提前返回，不推进、不拒绝', async () => {
    const { host, calls } = makeHost({ ensureInstanceBound: false });
    await handleApproveDecision(host, 'stage_decision', '决策内容', PANEL);
    assert.equal(calls.executed, 0);
    assert.equal(calls.rejections.length, 0);
  });

  it('无实例：拒绝并提示重新打开任务', async () => {
    const { host, calls } = makeHost({ ensureInstanceBound: true, instance: undefined });
    await handleApproveDecision(host, 'stage_decision', '决策内容', PANEL);
    assert.equal(calls.rejections.length, 1);
    assert.equal(calls.executed, 0);
  });

  it('阶段状态非 paused（running）：拒绝，不发生状态转移', async () => {
    const instance = decisionInstance('running');
    const { host, calls } = makeHost({ instance });
    await handleApproveDecision(host, 'stage_decision', '决策内容', PANEL);
    assert.equal(calls.rejections.length, 1);
    assert.equal(instance.stageRuntimes[0]!.status, 'running');
    assert.equal(calls.executed, 0);
  });

  it('阶段已 done：拒绝（不可重复批准）', async () => {
    const instance = decisionInstance('done');
    const { host, calls } = makeHost({ instance });
    await handleApproveDecision(host, 'stage_decision', '决策内容', PANEL);
    assert.equal(calls.rejections.length, 1);
    assert.equal(calls.executed, 0);
  });

  it('非决策阶段：拒绝使用「批准此决策」', async () => {
    const instance = decisionInstance('paused', { isDecisionStage: false });
    const { host, calls } = makeHost({ instance });
    await handleApproveDecision(host, 'stage_decision', '决策内容', PANEL);
    assert.equal(calls.rejections.length, 1);
    assert.equal(calls.executed, 0);
  });

  it('阶段索引与 currentStageIndex 不一致：拒绝（状态已变化）', async () => {
    const instance = decisionInstance('paused');
    instance.currentStageIndex = 1;
    const { host, calls } = makeHost({ instance });
    await handleApproveDecision(host, 'stage_decision', '决策内容', PANEL);
    assert.equal(calls.rejections.length, 1);
    assert.equal(calls.executed, 0);
  });

  it('决策内容 lint 拒绝：不推进、记录 approve_decision_rejected', async () => {
    // 开启 lint 且给一段缺少必填章节的内容 → 被 DecisionLintGate 拒绝。
    const instance = decisionInstance('paused', { enableLint: true });
    const { host, calls } = makeHost({ instance, decisionLintVscodeDefault: true });
    await handleApproveDecision(host, 'stage_decision', '随便写的不合规决策', PANEL);
    assert.ok(calls.userActions.some((a) => a.kind === 'approve_decision_rejected'));
    assert.equal(instance.stageRuntimes[0]!.status, 'paused');
    assert.equal(calls.executed, 0);
  });

  it('happy path：paused 决策阶段批准 → done + 落库 + 推进下一阶段', async () => {
    // 显式关闭内容 lint，聚焦状态转移本身。
    const instance = decisionInstance('paused', { enableLint: false });
    const { host, calls } = makeHost({ instance });
    const record = '已确认采用方案 A';

    await handleApproveDecision(host, 'stage_decision', record, PANEL);

    const rt = instance.stageRuntimes[0]!;
    assert.equal(rt.status, 'done', '阶段应转为 done');
    assert.equal(rt.outputs[PRIMARY_DECISION_OUTPUT_KEY], record);
    assert.equal(rt.approvedDecisionRecord, record);
    assert.ok(
      calls.userActions.some((a) => a.kind === 'approve_decision'),
      '应记录 approve_decision',
    );
    assert.ok(
      calls.messages.some((m) => m.type === 'stageStatusUpdate'),
      '应推送 stageStatusUpdate',
    );
    assert.equal(calls.bumped, 1, '应推进 currentStageIndex');
    assert.equal(instance.currentStageIndex, 1);
    assert.ok(calls.saved >= 1, '应调度持久化');
    assert.equal(calls.milestones, 1, '应记录里程碑');
    assert.equal(calls.executed, 1, '应触发下一阶段执行');
  });
});

/* ============================== HitlRetry ============================== */

describe('HitlRetry.handleRetry — 重试状态机', () => {
  it('无实例：no-op', async () => {
    const { host, calls } = makeHost({ ensureInstanceBound: true, instance: undefined });
    await handleRetry(host, 'stage_impl', '改一下', PANEL);
    assert.equal(calls.executed, 0);
    assert.equal(calls.userActions.length, 0);
  });

  it('阶段不存在：no-op', async () => {
    const instance = nonDecisionInstance('error');
    const { host, calls } = makeHost({ instance });
    await handleRetry(host, 'stage_missing', '改一下', PANEL);
    assert.equal(calls.executed, 0);
    assert.equal(instance.stageRuntimes[0]!.retryCount, 0, '不应改动 retryCount');
  });

  it('重试已达上限：拒绝且不发生状态转移', async () => {
    const instance = nonDecisionInstance('error', 3);
    const { host, calls } = makeHost({ instance, maxManualStageRetries: 3 });
    await handleRetry(host, 'stage_impl', '再试一次', PANEL);

    const rt = instance.stageRuntimes[0]!;
    assert.equal(rt.retryCount, 3, 'applyRetryBase 不应执行（retryCount 不变）');
    assert.equal(rt.status, 'error', '状态不应变化');
    assert.equal(calls.executed, 0);
    assert.ok(!calls.userActions.some((a) => a.kind === 'retry'), '不应记录 retry');
    assert.ok(
      calls.userActions.some((a) => a.kind === 'retry_rejected'),
      '应记录 retry_rejected（来自闸门）',
    );
  });

  it('非决策阶段重试：重置为 pending、retryCount+1、推进执行，无下游重置消息', async () => {
    const instance = nonDecisionInstance('error');
    instance.stageRuntimes[0]!.lastFailureSnapshot = {
      capturedAt: '2026-01-01T00:00:00.000Z',
      stderr: 'persist-after-retry',
      outputs: {},
    };
    const { host, calls } = makeHost({ instance });
    await handleRetry(host, 'stage_impl', '修复 bug', PANEL);

    const rt = instance.stageRuntimes[0]!;
    assert.equal(rt.status, 'pending');
    assert.equal(rt.retryCount, 1);
    assert.equal(rt.retryComment, '修复 bug');
    assert.equal(rt.lastFailureSnapshot?.stderr, 'persist-after-retry', '重试后应保留 failure snapshot');
    assert.equal(rt.lastError, undefined, 'applyRetryBase 应清除 lastError');
    assert.ok(calls.userActions.some((a) => a.kind === 'retry'));
    assert.ok(!calls.messages.some((m) => m.type === 'downstreamReset'), '非决策不应发下游重置');
    assert.equal(instance.currentStageIndex, 0);
    assert.equal(instance.status, 'running');
    assert.ok(calls.saved >= 1);
    assert.equal(calls.executed, 1);
  });

  it('决策阶段重试：级联重置下游消费阶段，无关阶段保持不变', async () => {
    const instance = decisionWithDownstreamInstance('running');
    instance.stageRuntimes[1]!.lastFailureSnapshot = {
      capturedAt: '2026-01-01T00:00:00.000Z',
      stderr: 'downstream-failure',
      outputs: {},
    };
    const { host, calls } = makeHost({ instance });

    await handleRetry(host, 'stage_decision', '换个方案', PANEL);

    const [decisionRt, downstreamRt, independentRt] = instance.stageRuntimes;

    // 决策阶段自身：进入 retrying，清空已批准记录与主输出。
    assert.equal(decisionRt!.status, 'retrying');
    assert.equal(decisionRt!.retryCount, 1);
    assert.equal(decisionRt!.retryComment, '换个方案');
    assert.equal(decisionRt!.approvedDecisionRecord, undefined);
    assert.equal(decisionRt!.outputs[PRIMARY_DECISION_OUTPUT_KEY], undefined);

    // 下游消费阶段：被级联重置为 pending 且清空输出。
    assert.equal(downstreamRt!.status, 'pending', '下游消费阶段应被重置');
    assert.deepEqual(downstreamRt!.outputs, {});
    assert.equal(downstreamRt!.lastFailureSnapshot, undefined, '被 reset 的下游应清除 snapshot');

    // 无关阶段：保持不变（选择性重置）。
    assert.equal(independentRt!.status, 'done', '无关阶段不应被重置');
    assert.deepEqual(independentRt!.outputs, { indep: 'y' });

    // 下游重置通知：仅含真正被重置的下游。
    const reset = calls.messages.find((m) => m.type === 'downstreamReset') as
      | { resetStageIds?: string[]; resetStageTitles?: string[] }
      | undefined;
    assert.ok(reset, '应推送 downstreamReset');
    assert.deepEqual(reset!.resetStageIds, ['stage_downstream']);
    assert.deepEqual(reset!.resetStageTitles, ['下游']);

    // I-9 不变量：被报告重置的阶段均已是 pending，不应触发 host.error。
    assert.ok(!calls.warns.some((w) => w.includes('I-9')), '不应有 I-9 违反');

    assert.equal(instance.currentStageIndex, 0, '应回退到决策阶段');
    assert.equal(instance.status, 'running');
    assert.equal(calls.executed, 1);
  });

  it('决策阶段重试：已完成的实例恢复为 running', async () => {
    const instance = decisionWithDownstreamInstance('completed');
    const { host } = makeHost({ instance });
    await handleRetry(host, 'stage_decision', '重新决策', PANEL);
    assert.equal(instance.status, 'running', 'completed 实例应被恢复为 running');
  });

  it('决策重试 + 真实回滚成功：下游产物落盘内容被还原、推进执行', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stagent-rollback-ok-'));
    const filePath = path.join(tmp, 'out.txt');
    fs.writeFileSync(filePath, 'NEW-content', 'utf-8');

    const instance = decisionWithDownstreamInstance('running', [
      downstreamArtifact(filePath, 'ORIGINAL-content'),
    ]);
    const { host, calls } = makeHost({ instance });

    await handleRetry(host, 'stage_decision', '换方案', PANEL);

    // 磁盘内容被回滚为写盘前的 priorContent。
    assert.equal(fs.readFileSync(filePath, 'utf-8'), 'ORIGINAL-content');

    // 级联重置照常发生，且 downstreamReset 带回滚文件清单。
    assert.equal(instance.stageRuntimes[0]!.status, 'retrying');
    assert.equal(instance.stageRuntimes[1]!.status, 'pending');
    const reset = calls.messages.find((m) => m.type === 'downstreamReset') as
      | { rolledBackFiles?: string[] }
      | undefined;
    assert.ok(reset, '应推送 downstreamReset');
    assert.deepEqual(reset!.rolledBackFiles, [filePath]);
    assert.equal(calls.executed, 1);

    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('决策重试 + 真实回滚失败：阻断重试，不发生级联重置与推进', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stagent-rollback-fail-'));
    // 用一个普通文件占住父路径名 → mkdirSync(dirname) 必抛 → 回滚失败。
    const blocker = path.join(tmp, 'blocker');
    fs.writeFileSync(blocker, 'x', 'utf-8');
    const failingPath = path.join(blocker, 'out.txt');

    const instance = decisionWithDownstreamInstance('running', [
      downstreamArtifact(failingPath, 'whatever'),
    ]);
    const { host, calls } = makeHost({ instance });

    await handleRetry(host, 'stage_decision', '换方案', PANEL);

    const [decisionRt, downstreamRt] = instance.stageRuntimes;

    // 回滚在状态变更之前执行：失败时不应改动 retry 状态（无 desync）。
    assert.equal(decisionRt!.retryCount, 0, 'applyRetryBase 不应执行（retryCount 不变）');
    assert.equal(decisionRt!.retryComment, undefined, 'retryComment 不应被设置');
    assert.equal(decisionRt!.status, 'done', '阶段状态不应变化');
    assert.equal(decisionRt!.approvedDecisionRecord, 'old', '已批准记录不应被清空');
    assert.equal(decisionRt!.outputs[PRIMARY_DECISION_OUTPUT_KEY], 'old');

    // 下游未被级联重置。
    assert.equal(downstreamRt!.status, 'done');
    assert.ok(!calls.messages.some((m) => m.type === 'downstreamReset'), '不应发下游重置');

    // 上报失败：stageError + warn，且不推进；并重新同步阶段状态以恢复可操作 UI。
    assert.ok(calls.messages.some((m) => m.type === 'stageError'), '应推送 stageError');
    assert.ok(
      calls.messages.some((m) => m.type === 'stageStatusUpdate' && m.stageId === 'stage_decision'),
      '应重新同步阶段状态',
    );
    assert.ok(
      calls.warns.some((w) => w.includes('artifact rollback failed')),
      '应记录回滚失败告警',
    );
    assert.equal(calls.executed, 0, '不应推进下一阶段');
    assert.equal(calls.saved, 0, '不应调度持久化');

    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('决策重试：registry 仅含非重置阶段产物 → 无需回滚，正常推进', async () => {
    // 该产物属于 stage_independent（不消费决策）→ 不在 resetStageIds → 不会被回滚。
    // 故意给一个回滚必失败的路径来反证：它确实未被触碰。
    const unrelated: Artifact = {
      ...downstreamArtifact('/nonexistent-dir/should-not-touch.txt', 'x'),
      stageId: 'stage_independent',
      outputKey: 'indep',
    };
    const instance = decisionWithDownstreamInstance('running', [unrelated]);
    const { host, calls } = makeHost({ instance });

    await handleRetry(host, 'stage_decision', '换方案', PANEL);

    assert.equal(instance.stageRuntimes[0]!.status, 'retrying', '应正常进入级联重置');
    assert.equal(instance.stageRuntimes[1]!.status, 'pending');
    assert.ok(!calls.warns.some((w) => w.includes('rollback failed')), '不应有回滚失败');
    assert.equal(calls.executed, 1, '应正常推进');
  });
});

/* ========================== DecisionLintGate ========================== */

describe('DecisionLintGate.evaluateApproveDecisionLintOrReject — 决策内容校验闸门', () => {
  it('globalConfig 显式关闭 lint：放行、无副作用', () => {
    const { host, calls } = makeHost({});
    const ok = evaluateApproveDecisionLintOrReject(
      host,
      PANEL,
      'stage_decision',
      lintDefinition(false),
      '随便写的决策',
    );
    assert.equal(ok, true);
    assert.equal(calls.userActions.length, 0);
    assert.equal(calls.messages.length, 0);
  });

  it('vscodeDefault=false 且无 globalConfig：放行', () => {
    const { host } = makeHost({ decisionLintVscodeDefault: false });
    const ok = evaluateApproveDecisionLintOrReject(
      host,
      PANEL,
      'stage_decision',
      lintDefinition(undefined),
      '随便写的决策',
    );
    assert.equal(ok, true);
  });

  it('lint 开启 + 内容不合规：拒绝、记 approve_decision_rejected、推 stageError', () => {
    const { host, calls } = makeHost({ decisionLintVscodeDefault: true });
    const ok = evaluateApproveDecisionLintOrReject(
      host,
      PANEL,
      'stage_decision',
      lintDefinition(true),
      '缺少必填章节的内容',
    );
    assert.equal(ok, false);
    const action = calls.userActions.find((a) => a.kind === 'approve_decision_rejected');
    assert.ok(action, '应记录 approve_decision_rejected');
    assert.ok(Array.isArray(action!.detail.violationCodes), '应附带 violationCodes');
    assert.ok(calls.messages.some((m) => m.type === 'stageError'), '应推送 stageError');
  });
});

/* ======================== HitlQuestionsBefore ======================== */

describe('HitlQuestionsBefore.handleAnswerQuestionsBefore — 工具前追问', () => {
  it('无实例：no-op', async () => {
    const { host, calls } = makeHost({ instance: undefined });
    await handleAnswerQuestionsBefore(host, 'stage_q', { q1: 'a' }, PANEL);
    assert.equal(calls.executed, 0);
  });

  it('阶段不存在：no-op', async () => {
    const instance = questionBeforeInstance('waiting-questions');
    const { host, calls } = makeHost({ instance });
    await handleAnswerQuestionsBefore(host, 'stage_missing', { q1: 'a' }, PANEL);
    assert.equal(calls.executed, 0);
  });

  it('必答项缺失：拒绝、不推进、不落答案', async () => {
    const instance = questionBeforeInstance('waiting-questions');
    const { host, calls } = makeHost({ instance });
    await handleAnswerQuestionsBefore(host, 'stage_q', {}, PANEL);

    assert.ok(calls.userActions.some((a) => a.kind === 'answer_questions_before_rejected'));
    assert.ok(calls.messages.some((m) => m.type === 'stageError'));
    assert.deepEqual(instance.stageRuntimes[0]!.questionBeforeAnswers, {});
    assert.equal(calls.executed, 0);
  });

  it('答案齐全：落答案、waiting-questions→pending、对齐索引、推进', async () => {
    // currentStageIndex 故意与阶段 idx(0) 不一致 → 触发 setCurrentStageIndex 分支。
    const instance = questionBeforeInstance('waiting-questions', 5);
    const { host, calls } = makeHost({ instance });
    await handleAnswerQuestionsBefore(host, 'stage_q', { q1: '必须可离线' }, PANEL);

    const rt = instance.stageRuntimes[0]!;
    assert.deepEqual(rt.questionBeforeAnswers, { q1: '必须可离线' });
    assert.equal(rt.status, 'pending', 'waiting-questions 应转为 pending');
    assert.ok(calls.userActions.some((a) => a.kind === 'answer_questions_before'));
    assert.equal(instance.currentStageIndex, 0, '应对齐到阶段索引');
    assert.ok(calls.saved >= 1);
    assert.equal(calls.executed, 1);
  });

  it('adaptive grill：仅校验已问过的题，未问的必答题不阻塞', async () => {
    // 契约节点决策阶段 → adaptive=true。只提交 q1（q2 尚未问）→ 不应因 q2 缺失被拒。
    const instance = adaptiveDecisionQuestionBeforeInstance();
    const { host, calls } = makeHost({ instance });
    await handleAnswerQuestionsBefore(host, 'stage_decision', { q1: '答案一' }, PANEL);

    assert.ok(
      !calls.userActions.some((a) => a.kind === 'answer_questions_before_rejected'),
      'adaptive 下未问的必答题不应触发拒绝',
    );
    assert.ok(calls.userActions.some((a) => a.kind === 'answer_questions_before'));
    assert.deepEqual(instance.stageRuntimes[0]!.questionBeforeAnswers, { q1: '答案一' });
    assert.equal(instance.stageRuntimes[0]!.status, 'pending');
    assert.equal(calls.executed, 1);
  });
});

/* ========================= HitlQuestionsAfter ========================= */

describe('HitlQuestionsAfter.handleAnswerQuestions — 工具后追问', () => {
  it('无实例：no-op', async () => {
    const { host, calls } = makeHost({ instance: undefined });
    await handleAnswerQuestions(host, 'stage_q', { qa: 'ok' }, PANEL);
    assert.equal(calls.executed, 0);
  });

  it('阶段非 paused：shouldAutoAdvance=false，直接返回', async () => {
    const instance = questionAfterInstance('running');
    const { host, calls } = makeHost({ instance });
    await handleAnswerQuestions(host, 'stage_q', { qa: 'ok' }, PANEL);
    assert.equal(calls.executed, 0);
    assert.equal(instance.stageRuntimes[0]!.status, 'running');
  });

  it('必答项缺失：拒绝、不推进', async () => {
    const instance = questionAfterInstance('paused');
    const { host, calls } = makeHost({ instance });
    await handleAnswerQuestions(host, 'stage_q', {}, PANEL);
    assert.ok(calls.userActions.some((a) => a.kind === 'answer_questions_after_rejected'));
    assert.ok(calls.messages.some((m) => m.type === 'stageError'));
    assert.equal(instance.stageRuntimes[0]!.status, 'paused');
    assert.equal(calls.executed, 0);
  });

  it('答案齐全：落答案、阶段 done、推进索引并执行下一阶段', async () => {
    const instance = questionAfterInstance('paused');
    const { host, calls } = makeHost({ instance });
    await handleAnswerQuestions(host, 'stage_q', { qa: '验收通过' }, PANEL);

    const rt = instance.stageRuntimes[0]!;
    assert.equal(rt.status, 'done');
    assert.deepEqual(rt.questionAnswers, { qa: '验收通过' });
    assert.ok(calls.userActions.some((a) => a.kind === 'answer_questions_after'));
    assert.ok(calls.messages.some((m) => m.type === 'stageStatusUpdate'));
    assert.equal(calls.bumped, 1);
    assert.ok(calls.saved >= 1);
    assert.equal(calls.executed, 1);
  });
});
