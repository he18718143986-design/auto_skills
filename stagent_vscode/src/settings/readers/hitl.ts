import type * as vscode from 'vscode';
import type { GlobalDecisionInjectMode } from '../../WorkflowDefinition';
import {
  DEFAULT_CONFIDENCE_PAUSE_THRESHOLD,
  DEFAULT_CONTRACT_NODE_PAUSE_THRESHOLD,
  resolveConfidencePauseThreshold,
  resolveContractNodePauseThreshold,
} from '../../StagentSettingsDefaults';
import {
  readConfigBooleanDefaultTrue,
  readConfigResolved,
  readConfigStringEnum,
} from './readConfigHelpers';

/** vscode `stagent.hitl.contractNodePauseThreshold`；M21.4，默认 0.75 */
export function readContractNodePauseThreshold(cfg?: vscode.WorkspaceConfiguration): number {
  return readConfigResolved(
    cfg,
    'hitl.contractNodePauseThreshold',
    resolveContractNodePauseThreshold,
    DEFAULT_CONTRACT_NODE_PAUSE_THRESHOLD,
  );
}

/** vscode `stagent.hitl.pauseContractNodes`；M21.4，默认 true（false 回滚至纯 confidence 阈值） */
export function readPauseContractNodesEnabled(cfg?: vscode.WorkspaceConfiguration): boolean {
  return readConfigBooleanDefaultTrue(cfg, 'hitl.pauseContractNodes');
}

/** vscode `stagent.confidence.pauseThreshold`；M16.2 AdaptiveHITL 将消费，M15.7 仅引擎读取并写 debug 日志 */
export function readConfidencePauseThreshold(cfg?: vscode.WorkspaceConfiguration): number {
  return readConfigResolved(
    cfg,
    'confidence.pauseThreshold',
    resolveConfidencePauseThreshold,
    DEFAULT_CONFIDENCE_PAUSE_THRESHOLD,
  );
}

/** vscode `stagent.enableDecisionContentLint`；默认 true（workflow globalConfig 可覆盖） */
export function readDecisionContentLintEnabled(cfg?: vscode.WorkspaceConfiguration): boolean {
  return readConfigBooleanDefaultTrue(cfg, 'enableDecisionContentLint');
}

/** vscode `stagent.injectApprovedDecisionContext`；默认 true */
export function readInjectApprovedDecisionContext(cfg?: vscode.WorkspaceConfiguration): boolean {
  return readConfigBooleanDefaultTrue(cfg, 'injectApprovedDecisionContext');
}

/** vscode `stagent.globalDecisionInjectMode`；默认 summary */
export function readGlobalDecisionInjectMode(
  cfg?: vscode.WorkspaceConfiguration,
): GlobalDecisionInjectMode {
  return readConfigStringEnum(cfg, 'globalDecisionInjectMode', ['full', 'summary'] as const, 'summary');
}
