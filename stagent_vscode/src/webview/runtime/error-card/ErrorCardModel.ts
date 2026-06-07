import {
  ERROR_TYPE_CODE_RUNNER_TIMEOUT,
  ERROR_TYPE_FILE_NOT_FOUND,
  ERROR_TYPE_INVARIANT_VIOLATION,
  ERROR_TYPE_LLM_CONTEXT_OVERFLOW,
  ERROR_TYPE_LLM_INVALID_OUTPUT,
  ERROR_TYPE_LLM_TIMEOUT,
  ERROR_TYPE_RETRY_LIMIT_EXCEEDED,
  ERROR_TYPE_STAGE_NOT_FOUND,
  ERROR_TYPE_TOOL_EXECUTION_FAILED,
  ERROR_TYPE_UNKNOWN,
} from '../../../errors/stageErrorBuilders';
import { isTestRunStageId } from '../../../workflow/StageIdPatterns';
import { wMsg } from '../../l10n/wMsg';
import { isDecisionStage } from '../shell';

export type ErrorUserCategory = 'environment' | 'code' | 'generic';

export const STAGE_ERROR_CARD: Record<
  string,
  { icon: string; title: string; actions: Array<{ label: string; type: string }> }
> = {
  [ERROR_TYPE_LLM_TIMEOUT]: { icon: '⏱️', title: wMsg('stagent.webview.error.llmTimeoutTitle'), actions: [{ label: wMsg('stagent.webview.error.actionRetry'), type: 'retry' }] },
  [ERROR_TYPE_LLM_CONTEXT_OVERFLOW]: { icon: '📚', title: wMsg('stagent.webview.error.llmContextTitle'), actions: [{ label: wMsg('stagent.webview.error.actionEditInput'), type: 'editInput' }] },
  [ERROR_TYPE_LLM_INVALID_OUTPUT]: {
    icon: '📄',
    title: wMsg('stagent.webview.error.parseTitle'),
    actions: [
      { label: wMsg('stagent.webview.error.actionRetry'), type: 'retry' },
      { label: wMsg('stagent.webview.error.actionShowRaw'), type: 'showRaw' },
    ],
  },
  [ERROR_TYPE_TOOL_EXECUTION_FAILED]: {
    icon: '🔧',
    title: wMsg('stagent.webview.error.commandFailedTitle'),
    actions: [
      { label: wMsg('stagent.webview.error.actionRetry'), type: 'retry' },
      { label: wMsg('stagent.webview.error.actionShowOutput'), type: 'showOutput' },
    ],
  },
  [ERROR_TYPE_CODE_RUNNER_TIMEOUT]: { icon: '⏰', title: wMsg('stagent.webview.error.runnerTimeoutTitle'), actions: [{ label: wMsg('stagent.webview.error.actionRetry'), type: 'retry' }] },
  [ERROR_TYPE_FILE_NOT_FOUND]: { icon: '📁', title: wMsg('stagent.webview.error.fileNotFoundTitle'), actions: [{ label: wMsg('stagent.webview.error.actionCheckPath'), type: 'editInput' }] },
  [ERROR_TYPE_STAGE_NOT_FOUND]: { icon: '🔗', title: wMsg('stagent.webview.error.stageNotFoundTitle'), actions: [{ label: wMsg('stagent.webview.error.actionEditWorkflow'), type: 'editWorkflow' }] },
  [ERROR_TYPE_INVARIANT_VIOLATION]: {
    icon: '⚙️',
    title: wMsg('stagent.webview.error.invariantTitle'),
    actions: [
      { label: wMsg('stagent.webview.error.actionRetry'), type: 'retry' },
      { label: wMsg('stagent.webview.error.actionShowLog'), type: 'showLog' },
    ],
  },
  [ERROR_TYPE_RETRY_LIMIT_EXCEEDED]: {
    icon: '🔁',
    title: wMsg('stagent.webview.error.retryLimitTitle'),
    actions: [{ label: wMsg('stagent.webview.error.actionShowLog'), type: 'showLog' }],
  },
  [ERROR_TYPE_UNKNOWN]: {
    icon: '⚠️',
    title: wMsg('stagent.webview.error.unknownTitle'),
    actions: [
      { label: wMsg('stagent.webview.error.actionRetry'), type: 'retry' },
      { label: wMsg('stagent.webview.error.actionShowLog'), type: 'showLog' },
    ],
  },
};

const CATEGORY_ICONS: Record<ErrorUserCategory, string> = {
  environment: '🧰',
  code: '🧪',
  generic: '🔧',
};

export interface StageErrorCardMessage {
  stageId: string;
  errorType: string;
  error?: string;
  userTitle?: string;
  userBody?: string;
  userCategory?: ErrorUserCategory;
  exitCode?: number;
  weakenRetry?: boolean;
  playbookSteps?: string[];
  rawOutput?: string;
  stdout?: string;
  stderr?: string;
}

export interface ErrorCardAction {
  label: string;
  type: string;
  primary?: boolean;
  hint?: string;
}

export interface ErrorCardModel {
  msg: StageErrorCardMessage;
  cfg: { icon: string; title: string; actions: Array<{ label: string; type: string }> };
  displayTitle: string;
  titleText: string;
  bodyText: string;
  categoryLabel?: string;
  actions: ErrorCardAction[];
  dockHintText: string;
  techSummaryLines: string[];
}

function categoryLabel(category: ErrorUserCategory | undefined): string | undefined {
  if (category === 'environment') {
    return wMsg('stagent.webview.error.categoryEnvironment');
  }
  if (category === 'code') {
    return wMsg('stagent.webview.error.categoryCode');
  }
  if (category === 'generic') {
    return wMsg('stagent.webview.error.categoryGeneric');
  }
  return undefined;
}

function resolveIcon(msg: StageErrorCardMessage, cfgIcon: string): string {
  if (msg.userCategory && CATEGORY_ICONS[msg.userCategory]) {
    return CATEGORY_ICONS[msg.userCategory];
  }
  return cfgIcon;
}

function shouldOfferUpstreamFix(msg: StageErrorCardMessage): boolean {
  return (
    isTestRunStageId(msg.stageId) &&
    msg.userCategory === 'code' &&
    !msg.weakenRetry &&
    msg.exitCode !== 127
  );
}

function buildActions(msg: StageErrorCardMessage, base: Array<{ label: string; type: string }>): ErrorCardAction[] {
  let actions: ErrorCardAction[] = base.map(function (a) {
    return { label: a.label, type: a.type };
  });

  if (msg.weakenRetry) {
    actions = actions.map(function (a) {
      if (a.type === 'retry') {
        return {
          ...a,
          label: wMsg('stagent.webview.error.actionRetryAnyway'),
          hint: wMsg('stagent.webview.error.retryNotHelpfulHint'),
          primary: false,
        };
      }
      if (a.type === 'showOutput') {
        return {
          ...a,
          label: wMsg('stagent.webview.error.actionShowDetails'),
          primary: true,
        };
      }
      return { ...a, primary: false };
    });
    const primaryIdx = actions.findIndex(function (a) { return a.primary; });
    if (primaryIdx > 0) {
      const [primary] = actions.splice(primaryIdx, 1);
      actions.unshift(primary!);
    }
  } else {
    actions = actions.map(function (a) {
      return { ...a, primary: a.type === 'retry' };
    });
  }

  if (isDecisionStage(msg.stageId) && !actions.some(function (a) { return a.type === 'editWorkflow'; })) {
    actions.push({ label: wMsg('stagent.webview.error.actionEditWorkflow'), type: 'editWorkflow' });
  }
  if (shouldOfferUpstreamFix(msg)) {
    actions = [
      { label: wMsg('stagent.webview.error.actionFixCode'), type: 'upstreamFix', primary: true },
      ...actions.map(function (a) {
        return { ...a, primary: false };
      }),
    ];
  }
  return actions;
}

function buildTechSummaryLines(msg: StageErrorCardMessage): string[] {
  const lines: string[] = [];
  lines.push(wMsg('stagent.webview.error.typeLabel', msg.errorType));
  lines.push(wMsg('stagent.webview.error.techStageId', msg.stageId));
  if (typeof msg.exitCode === 'number') {
    lines.push(wMsg('stagent.webview.error.techExitCode', msg.exitCode));
  }
  if (msg.error) {
    lines.push(msg.error);
  }
  return lines;
}

export function buildErrorCardModel(msg: StageErrorCardMessage): ErrorCardModel {
  const cfg = STAGE_ERROR_CARD[msg.errorType] || STAGE_ERROR_CARD[ERROR_TYPE_UNKNOWN];
  const displayTitle = msg.userTitle || cfg.title;
  const bodyText = msg.userBody || msg.error || '';
  const icon = resolveIcon(msg, cfg.icon);
  const actions = buildActions(msg, cfg.actions);
  return {
    msg,
    cfg: { ...cfg, icon },
    displayTitle,
    titleText: displayTitle,
    bodyText,
    categoryLabel: categoryLabel(msg.userCategory),
    actions,
    dockHintText: displayTitle,
    techSummaryLines: buildTechSummaryLines(msg),
  };
}

export type StageStageCardModel = ErrorCardModel;

export function buildStageErrorCardModel(msg: StageErrorCardMessage): StageStageCardModel {
  return buildErrorCardModel(msg);
}
