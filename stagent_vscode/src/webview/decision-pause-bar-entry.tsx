import { render } from 'preact';
import { DecisionPauseBarDock, type DecisionPauseBarDockProps } from './components/DecisionPauseBar';

export function mountDecisionPauseBarDock(
  container: HTMLElement,
  props: DecisionPauseBarDockProps,
): void {
  render(<DecisionPauseBarDock {...props} />, container);
}

declare global {
  interface Window {
    mountDecisionPauseBarDock?: typeof mountDecisionPauseBarDock;
  }
}

window.mountDecisionPauseBarDock = mountDecisionPauseBarDock;
