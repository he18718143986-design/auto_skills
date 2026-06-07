import { render } from 'preact';
import { StageTimeline, type StageTimelineProps } from './components/StageTimeline';

export function mountStageTimeline(container: HTMLElement, props: StageTimelineProps): void {
  render(<StageTimeline {...props} />, container);
}

declare global {
  interface Window {
    mountStageTimeline?: typeof mountStageTimeline;
  }
}

window.mountStageTimeline = mountStageTimeline;
