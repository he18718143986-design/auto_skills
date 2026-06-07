#!/usr/bin/env node
import fs from 'fs';

const enPath = 'package.nls.json';
const zhPath = 'package.nls.zh-cn.json';
const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
const zh = JSON.parse(fs.readFileSync(zhPath, 'utf8'));

const messagesEn = {
  'stagent.rule20.missingDecisionStage': 'Impl stage is missing a paired decision stage.',
  'stagent.rule20.brokenNamingPair':
    'Decision stage has no downstream stage with the same semanticName (expected stage_impl_* or stage_*).',
  'stagent.rule20.missingDecisionRecordSource': 'Impl stage input.sources is missing a decisionRecord dependency.',
  'stagent.rule20.missingConstraintPrompt':
    'Impl stage systemPrompt is missing the required constraint to implement the confirmed decision list.',
  'stagent.rule20.testRunMustUseCodeRunner':
    'stage_test_run_* stages must use tool="code-runner" (e.g. npm test); do not use llm-text to narrate test results.',
  'stagent.rule20.testRunImportsMissingArtifact': '{0}',
  'stagent.rule20.toIssuesHorizontalLayering':
    'Multiple decision stages are all placed before the first impl stage (horizontal layering). Prefer interleaved decide→test_write→impl→test_run per slice (warning).',
  'stagent.rule20.debugFeedbackLoopNotFirst':
    'Debug workflow should prioritize feedback loop: executable reproduce/regression (code-runner/reproduce) must come before hypothesis or fix impl (I-26, warning).',
  'stagent.rule20.debugMissingReproduceStage':
    'Debug workflow should include a reproduce stage (warning).',
  'stagent.rule20.debugMissingHypothesisStage':
    'Debug workflow should include a hypothesis/root-cause stage (warning).',
  'stagent.rule20.debugMissingVerificationStage':
    'Debug workflow is missing an executable verification stage (test_run/code-runner) (warning).',
  'stagent.rule20.exposeAssumptionsExemption':
    'Impl stage has no paired decision stage but exposeAssumptions=true (exempt).',
  'stagent.rule20.modelTierDowngrade':
    'Detected globalConfig.modelOverrides.decisionStage; confirm this downgrade is intentional.',
  'stagent.rule20.prototypeMissingVerificationStage':
    'Prototype workflow is missing an experimental verification stage (test_run/code-runner) (warning).',
  'stagent.rule20.prototypeMissingSuccessCriteria':
    'Prototype workflow is missing success/failure criteria (warning).',
  'stagent.rule20.prototypeImplMissingFileReadFollowup':
    'After prototype impl {0} writes "{1}", add a file-read stage or reference the artifact from the next impl via stage-output/file (warning).',
  'stagent.rule20.debugImplMissingDecisionSource':
    'Debug fix impl should bind decision/hypothesis inputs (decisionRecord/hypothesis) (warning).',
  'stagent.rule20.toIssuesMissingChain':
    'to-issues vertical slice chain is incomplete; add decide/test_write/impl/test_run (warning).',
  'stagent.rule20.toIssuesMissingVerification':
    'to-issues slice is missing an executable verification stage (test_run/code-runner) (warning).',
  'stagent.rule20.toIssuesMonolithicImplNaming':
    'to-issues: avoid monolithic impl naming; use single-slice semantic names (warning).',
  'stagent.rule20.toIssuesHighHitlRatio':
    'to-issues HITL ratio is high ({0}); prefer AFK chains (warning).',
  'stagent.rule20.refactorMissingDecisionStage':
    'Refactor workflow should include stage_decide_refactor_<X> decision stages (warning).',
  'stagent.rule20.refactorMissingVerificationStage':
    'Refactor workflow is missing an executable verification stage (test_run/code-runner) (warning).',
  'stagent.rule20.refactorMonolithicImplNaming':
    'Refactor impl naming is too aggregated; use single-slice semantic names (warning).',
  'stagent.rule20.softwareMissingGlobalArchitectureDecision':
    'Software workflow may need a global architecture decision before the first slice (see SPEC §7.8) (warning).',
  'stagent.rule20.globalArchitectureDecisionAutoInserted':
    'Engine auto-inserted global architecture decision shell (stage_decide_architecture_overview); review DecisionRecord before run. Disable stagent.autoInsertGlobalArchitectureDecision to let the model generate it.',
  'stagent.rule20.implDecisionNotPaired':
    'Impl has no same-name decision stage but is decision-backed (align naming or merge, warning).',
  'stagent.rule20.decisionNotPaired':
    'Decision has no same-name downstream but decisionRecord is consumed by impl (align naming, warning).',
  'stagent.rule20.horizontalTdd':
    'Horizontal TDD detected: all tests before all impls. Prefer one slice per red-green loop (warning).',
  'stagent.rule20.improveArchitectureMissingZoomOut':
    'improve-architecture workflow should include stage_zoom_out module map (warning).',
  'stagent.rule20.dagDependencyCycleHint': '{0} (Rule20: fix before relying on DAG execution.)',
  'stagent.rule20.dagUnreachableFromEntry':
    'DAG mode: stages unreachable from stages[0] via deps (possible orphan): {0}{1}',
};

const messagesZh = {
  'stagent.rule20.missingDecisionStage': '实现阶段缺少对应决策阶段',
  'stagent.rule20.brokenNamingPair': '决策阶段找不到同 semanticName 的下游阶段（stage_impl_* 或 stage_*）',
  'stagent.rule20.missingDecisionRecordSource': '实现阶段 input.sources 缺少 decisionRecord 依赖',
  'stagent.rule20.missingConstraintPrompt': '实现阶段 systemPrompt 缺少“严格按照已确认的决策清单实现”约束语句',
  'stagent.rule20.testRunMustUseCodeRunner':
    '阶段 id 为 stage_test_run_* 时必须使用 tool="code-runner"（例如 npm test / npm run test），禁止用 llm-text 口述测试结果',
  'stagent.rule20.testRunImportsMissingArtifact': '{0}',
  'stagent.rule20.toIssuesHorizontalLayering':
    '检测到多个决策阶段全部排在首个实现阶段之前，疑似水平分层（批量决策后再进入实现）。建议按切片交错推进 decide→test_write→impl→test_run（warning）。',
  'stagent.rule20.debugFeedbackLoopNotFirst':
    'debug 工作流应「反馈回路优先」：可执行复现/回归（code-runner/reproduce）阶段须排在根因假设或修复实现之前（I-26，warning）。',
  'stagent.rule20.debugMissingReproduceStage': 'debug 工作流建议包含可复现场景阶段（reproduce）（warning）。',
  'stagent.rule20.debugMissingHypothesisStage':
    'debug 工作流建议包含根因假设阶段（hypothesis/root-cause）（warning）。',
  'stagent.rule20.debugMissingVerificationStage':
    'debug 工作流缺少可执行验证阶段（test_run/code-runner）（warning）。',
  'stagent.rule20.exposeAssumptionsExemption': '实现阶段无对应决策阶段，但声明 exposeAssumptions=true（豁免）',
  'stagent.rule20.modelTierDowngrade': '检测到 globalConfig.modelOverrides.decisionStage，需确认是否为有意识降级。',
  'stagent.rule20.prototypeMissingVerificationStage':
    'prototype 工作流缺少实验验证阶段（test_run/code-runner）（warning）。',
  'stagent.rule20.prototypeMissingSuccessCriteria': 'prototype 工作流缺少成功/失败判据定义（warning）。',
  'stagent.rule20.prototypeImplMissingFileReadFollowup':
    'prototype 实现 {0} 落盘「{1}」后，建议插入 file-read 阶段，或令下一 impl 通过 stage-output/file 引用该产物（warning）。',
  'stagent.rule20.debugImplMissingDecisionSource':
    'debug 修复阶段建议绑定决策/假设类输入（decisionRecord/hypothesis）（warning）。',
  'stagent.rule20.toIssuesMissingChain':
    'to-issues 垂直切片链路不完整，建议补齐 decide/test_write/impl/test_run（warning）。',
  'stagent.rule20.toIssuesMissingVerification':
    'to-issues 切片缺少可执行验证阶段（test_run/code-runner）（warning）。',
  'stagent.rule20.toIssuesMonolithicImplNaming':
    'to-issues 不建议使用聚合式 impl 命名，建议改为单切片语义命名（warning）。',
  'stagent.rule20.toIssuesHighHitlRatio': 'to-issues HITL 比例偏高（{0}），建议优先 AFK 链路（warning）。',
  'stagent.rule20.refactorMissingDecisionStage':
    'refactor 工作流建议包含 stage_decide_refactor_<X> 决策阶段（warning）。',
  'stagent.rule20.refactorMissingVerificationStage':
    'refactor 工作流缺少可执行验证阶段（test_run/code-runner）（warning）。',
  'stagent.rule20.refactorMonolithicImplNaming':
    'refactor 实现阶段命名过于聚合，建议使用单切片语义命名（warning）。',
  'stagent.rule20.softwareMissingGlobalArchitectureDecision':
    'software 工作流疑似多模块/完整项目（stage_impl_* 数量 >5 或用户输入含全栈/多模块等关键词），建议在首个切片决策前插入全局架构决策阶段（如 stage_decide_architecture_overview），见 SPEC §7.8（warning）。',
  'stagent.rule20.globalArchitectureDecisionAutoInserted':
    '引擎已自动插入全局架构决策空壳阶段（stage_decide_architecture_overview），请审阅 DecisionRecord 后再执行；可关闭 stagent.autoInsertGlobalArchitectureDecision 并重新生成以改由模型产出。',
  'stagent.rule20.implDecisionNotPaired':
    '实现阶段无同名决策阶段，但已有决策背书（建议命名对齐或合并，warning）',
  'stagent.rule20.decisionNotPaired':
    '决策阶段无同名下游阶段，但 decisionRecord 已被实现引用（建议命名对齐，warning）',
  'stagent.rule20.horizontalTdd':
    '检测到 horizontal TDD：所有测试阶段排在所有实现阶段之前。建议改为「一切片一循环」（每个切片先红再绿）以缩短反馈回路（warning）。',
  'stagent.rule20.improveArchitectureMissingZoomOut':
    'improve-architecture 工作流建议包含 stage_zoom_out 模块地图阶段（warning）。',
  'stagent.rule20.dagDependencyCycleHint':
    '{0}（Rule20：与 validateGeneratedWorkflow 一致；请先修复后再依赖 DAG 执行。）',
  'stagent.rule20.dagUnreachableFromEntry':
    'DAG 模式：以下阶段从 stages[0] 经依赖边不可达，可能为孤立子图或未挂到主链：{0}{1}',
};

const labelsEn = {
  'stagent.rule20.label.missingDecisionStage': 'Missing decision stage (decide_*)',
  'stagent.rule20.label.brokenNamingPair': 'Incomplete vertical slice naming (decide/test_write/impl/test_run)',
  'stagent.rule20.label.missingDecisionRecordSource': 'Impl does not reference decisionRecord',
  'stagent.rule20.label.missingConstraintPrompt': 'Impl systemPrompt missing decision constraint',
  'stagent.rule20.label.testRunMustUseCodeRunner': 'Verification stage must use code-runner',
  'stagent.rule20.label.testRunImportsMissingArtifact': 'test_run references Python module/script not on disk',
  'stagent.rule20.label.softwareMissingGlobalArchitectureDecision': 'Software task missing global architecture decision',
  'stagent.rule20.label.globalArchitectureDecisionAutoInserted':
    'Engine inserted global architecture decision shell (review before run)',
  'stagent.rule20.label.implDecisionNotPaired': 'Impl without same-name decision (decision-backed; align naming)',
  'stagent.rule20.label.decisionNotPaired': 'Decision without same-name downstream (referenced by impl)',
  'stagent.rule20.label.exposeAssumptionsExemption': 'exposeAssumptions exemption',
  'stagent.rule20.label.modelTierDowngrade': 'Model tier downgrade',
  'stagent.rule20.label.prototypeMissingVerificationStage': 'Prototype missing verification stage',
  'stagent.rule20.label.prototypeMissingSuccessCriteria': 'Prototype missing success criteria',
  'stagent.rule20.label.prototypeImplMissingFileReadFollowup':
    'Prototype impl missing file-read or downstream stage-output ref',
  'stagent.rule20.label.debugMissingReproduceStage': 'Debug missing reproduce stage',
  'stagent.rule20.label.debugMissingHypothesisStage': 'Debug missing hypothesis stage',
  'stagent.rule20.label.debugMissingVerificationStage': 'Debug missing regression verification',
  'stagent.rule20.label.debugImplMissingDecisionSource': 'Debug fix impl missing decision output ref',
  'stagent.rule20.label.debugFeedbackLoopNotFirst': 'Debug reproduce/verify not before hypothesis/fix (I-26)',
  'stagent.rule20.label.horizontalTdd': 'Horizontal TDD: all tests before all impls',
  'stagent.rule20.label.toIssuesMissingChain': 'to-issues missing full slice chain',
  'stagent.rule20.label.toIssuesMissingVerification': 'to-issues missing verification',
  'stagent.rule20.label.toIssuesMonolithicImplNaming': 'to-issues impl naming too monolithic',
  'stagent.rule20.label.toIssuesHighHitlRatio': 'to-issues HITL ratio high',
  'stagent.rule20.label.toIssuesHorizontalLayering': 'to-issues possible horizontal layering',
  'stagent.rule20.label.refactorMissingDecisionStage': 'Refactor missing decision stage',
  'stagent.rule20.label.refactorMissingVerificationStage': 'Refactor missing verification',
  'stagent.rule20.label.refactorMonolithicImplNaming': 'Refactor impl naming too monolithic',
  'stagent.rule20.label.dagUnreachableFromEntry': 'DAG stages unreachable from entry',
  'stagent.rule20.label.dagDependencyCycleHint': 'DAG dependency cycle suspected',
  'stagent.rule20.label.stage_count_near_limit': 'Stage count near limit (>45); consider splitting',
  'stagent.rule20.label.restored_from_persistence': 'Restored from persistence (not from this generateWorkflow)',
  'stagent.rule20.display.violationPrefix': '[Rule20 violation]',
  'stagent.rule20.display.softPrefix': '[Rule20 hint]',
  'stagent.rule20.display.contractPrefix': '[Contract check]',
  'stagent.contract.label.sampleMockSourceUnshared':
    'Sample and mock data do not share the same ASIN source',
  'stagent.contract.label.implMissingDecisionSource': 'Pipeline core impl missing decisionRecord',
  'stagent.contract.label.weakIntegrationAssertion': 'Integration test only checks row count',
  'stagent.contract.label.crossFileKeyMismatch': 'Cross-file key names may mismatch',
  'stagent.contract.label.sampleHeaderUnmapped': 'Sample Excel header not mapped by reader',
  'stagent.contract.label.nonCanonicalKey': 'Key drifts from CONTEXT.md canonical terms',
  'stagent.contract.label.testNoAssertion': 'Test has no assertions',
  'stagent.contract.label.testTautologicalAssertion': 'Tautological assertion (e.g. assert True)',
  'stagent.contract.label.testTestsImplementation': 'Test couples to implementation only',
};

const labelsZh = {
  'stagent.rule20.label.missingDecisionStage': '缺少决策阶段（decide_*）',
  'stagent.rule20.label.brokenNamingPair': '垂直切片命名不完整（decide/test_write/impl/test_run 配对）',
  'stagent.rule20.label.missingDecisionRecordSource': '实现阶段未引用 decisionRecord',
  'stagent.rule20.label.missingConstraintPrompt': '实现阶段 systemPrompt 缺少决策约束',
  'stagent.rule20.label.testRunMustUseCodeRunner': '验证阶段须使用 code-runner',
  'stagent.rule20.label.testRunImportsMissingArtifact': 'test_run 引用了未落盘的 Python 模块/脚本',
  'stagent.rule20.label.softwareMissingGlobalArchitectureDecision': 'software 任务缺少全局架构决策阶段',
  'stagent.rule20.label.globalArchitectureDecisionAutoInserted':
    '引擎已插入全局架构决策空壳（请审阅后再执行）',
  'stagent.rule20.label.implDecisionNotPaired': '实现阶段无同名决策阶段（已有决策背书，建议命名对齐或合并）',
  'stagent.rule20.label.decisionNotPaired': '决策阶段无同名下游阶段（decisionRecord 已被实现引用，建议命名对齐）',
  'stagent.rule20.label.exposeAssumptionsExemption': 'exposeAssumptions 豁免提示',
  'stagent.rule20.label.modelTierDowngrade': '模型层级降级提示',
  'stagent.rule20.label.prototypeMissingVerificationStage': 'prototype 缺少验证阶段',
  'stagent.rule20.label.prototypeMissingSuccessCriteria': 'prototype 缺少成功标准',
  'stagent.rule20.label.prototypeImplMissingFileReadFollowup':
    'prototype impl 后缺少 file-read 或下游 stage-output 引用',
  'stagent.rule20.label.debugMissingReproduceStage': 'debug 缺少复现阶段',
  'stagent.rule20.label.debugMissingHypothesisStage': 'debug 缺少根因假设阶段',
  'stagent.rule20.label.debugMissingVerificationStage': 'debug 缺少回归验证阶段',
  'stagent.rule20.label.debugImplMissingDecisionSource': 'debug 修复实现未引用决策输出',
  'stagent.rule20.label.debugFeedbackLoopNotFirst': 'debug 复现/验证未排在假设与修复之前（反馈回路优先 I-26）',
  'stagent.rule20.label.horizontalTdd': 'horizontal TDD：测试全在前、实现全在后（建议一切片一循环）',
  'stagent.rule20.label.toIssuesMissingChain': 'to-issues 缺少完整切片链',
  'stagent.rule20.label.toIssuesMissingVerification': 'to-issues 缺少验证阶段',
  'stagent.rule20.label.toIssuesMonolithicImplNaming': 'to-issues 实现阶段命名过于单体',
  'stagent.rule20.label.toIssuesHighHitlRatio': 'to-issues 人工闸门比例偏高',
  'stagent.rule20.label.toIssuesHorizontalLayering': 'to-issues 疑似水平分层反模式',
  'stagent.rule20.label.refactorMissingDecisionStage': 'refactor 缺少决策阶段',
  'stagent.rule20.label.refactorMissingVerificationStage': 'refactor 缺少验证阶段',
  'stagent.rule20.label.refactorMonolithicImplNaming': 'refactor 实现阶段命名过于单体',
  'stagent.rule20.label.dagUnreachableFromEntry': 'DAG 存在从入口不可达的阶段',
  'stagent.rule20.label.dagDependencyCycleHint': 'DAG 依赖图可能存在环',
  'stagent.rule20.label.stage_count_near_limit': '阶段数接近上限（>45），建议拆分或精简',
  'stagent.rule20.label.restored_from_persistence': '已从持久化恢复（非本次 generateWorkflow 校验）',
  'stagent.rule20.display.violationPrefix': '[Rule20 违反]',
  'stagent.rule20.display.softPrefix': '[Rule20 提示]',
  'stagent.rule20.display.contractPrefix': '[契约检查]',
  'stagent.contract.label.sampleMockSourceUnshared':
    '样例数据与 mock 数据未共享同一 ASIN 源（应一方引用另一方输出）',
  'stagent.contract.label.implMissingDecisionSource': '数据管道核心 impl 未引用 decisionRecord',
  'stagent.contract.label.weakIntegrationAssertion': '集成验证仅断言行数，未校验内容正确性（query_status=success / 告警）',
  'stagent.contract.label.crossFileKeyMismatch': '跨文件键名疑似不一致（产出 vs 消费）',
  'stagent.contract.label.sampleHeaderUnmapped': '样例 Excel 表头未被 reader 列名映射精确识别（near-miss，将判定缺列）',
  'stagent.contract.label.nonCanonicalKey': '键名偏离 CONTEXT.md 权威术语（疑似漂移）',
  'stagent.contract.label.testNoAssertion': '测试缺少断言（无法验证行为）',
  'stagent.contract.label.testTautologicalAssertion': '恒真断言（assert True 等，等于没测）',
  'stagent.contract.label.testTestsImplementation': '测试耦合实现/仅断言存在，未测真实行为',
};

Object.assign(en, messagesEn, labelsEn);
Object.assign(zh, messagesZh, labelsZh);
fs.writeFileSync(enPath, JSON.stringify(en, null, 2) + '\n');
fs.writeFileSync(zhPath, JSON.stringify(zh, null, 2) + '\n');
console.log('merged', Object.keys(messagesEn).length, 'msgs', Object.keys(labelsEn).length, 'labels');
