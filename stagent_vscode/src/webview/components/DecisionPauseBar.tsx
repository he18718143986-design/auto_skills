/** Preact 试点：决策暂停条底栏按钮区。 */
import { h } from 'preact';

export interface DecisionPauseBarDockProps {
  enableRetry: boolean;
  enableApprove: boolean;
  onRetry: () => void;
  onApprove: () => void;
  onForceApprove?: () => void;
  showForceApprove?: boolean;
}

export function DecisionPauseBarDock(props: DecisionPauseBarDockProps) {
  return (
    <div class="decision-pause-dock">
      <button
        type="button"
        class="secondary"
        disabled={!props.enableRetry}
        onClick={() => props.onRetry()}
      >
        🔄 让 AI 重新生成
      </button>
      {props.showForceApprove ? (
        <button type="button" class="secondary" onClick={() => props.onForceApprove?.()}>
          忽略，直接批准
        </button>
      ) : null}
      <button type="button" disabled={!props.enableApprove} onClick={() => props.onApprove()}>
        ✅ 批准此决策
      </button>
    </div>
  );
}
