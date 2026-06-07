export function wireDecisionPauseBarDock(
  dock: HTMLElement,
  btnRetry: HTMLButtonElement,
  btnApprove: HTMLButtonElement,
  forceApproveBtn: HTMLButtonElement,
  uiState: { enableRetry: boolean; enableApproveDecision: boolean },
): () => void {
  const preactMount =
    typeof window !== 'undefined' &&
    !window.__STAGENT_WEBVIEW_TEST__ &&
    typeof mountDecisionPauseBarDock === 'function';
  const mountDock = preactMount && typeof dock.nodeType === 'number' && dock.nodeType === 1;
  const renderPreactDock = () => {
    mountDecisionPauseBarDock(dock, {
      enableRetry: !!uiState.enableRetry,
      enableApprove: !!uiState.enableApproveDecision,
      onRetry: () => btnRetry.onclick?.(null as unknown as MouseEvent),
      onApprove: () => btnApprove.onclick?.(null as unknown as MouseEvent),
      onForceApprove: () => forceApproveBtn.onclick?.(null as unknown as MouseEvent),
      showForceApprove: forceApproveBtn.style.display !== 'none',
    });
  };
  if (mountDock) {
    renderPreactDock();
    return renderPreactDock;
  }
  dock.appendChild(btnRetry);
  dock.appendChild(forceApproveBtn);
  dock.appendChild(btnApprove);
  return () => {};
}
