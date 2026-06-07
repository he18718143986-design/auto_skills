/* ------------------------------------------------------------------ */
/*  @stagent/core — 平台中立的工作流引擎公共出口                        */
/*                                                                     */
/*  宿主(VS Code 扩展 / Electron)只通过本 barrel 消费 core，            */
/*  core 自身不依赖任何宿主(无运行时 vscode)。                          */
/* ------------------------------------------------------------------ */

export * from './platform/PlatformAdapter';
export { WorkflowEngine, isFrontendMessage } from './WorkflowEngine';
export { buildWorkflowWebviewHtml } from './WebviewPanel';
export type { TaskListItem } from './WorkflowInstanceQuery';
export { parseSseDeltaStream } from './SseDeltaStream';
export { readLlmMaxOutputTokens } from './StagentSettings';

/* 协议与领域类型（供宿主 UI 渲染消费；type-only，渲染层可安全 import type） */
export type {
  FrontendMessage,
  BackendMessage,
  WorkflowDefinition,
  WorkflowMeta,
  WorkflowInstance,
  WorkflowStatus,
  Stage,
  StageRuntime,
  StageStatus,
  StageOutput,
  Question,
  ToolType,
  ErrorType,
} from './WorkflowDefinition';
export type { PlanSummary, StageSourceEdge } from './WorkflowPlanSummary';
export type { StageArtifactHint } from './ArtifactUiHints';
export type { DeleteScope } from './WorkflowDeletePlan';
