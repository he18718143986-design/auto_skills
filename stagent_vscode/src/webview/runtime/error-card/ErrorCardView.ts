import type { StageErrorCardModel } from './ErrorCardModel';
import { appendErrorCardHeader } from './ErrorCardHeaderView';
import { appendErrorCardExpandPanels } from './ErrorCardExpandPanels';
import { mountErrorCardDockActions } from './ErrorCardDockActions';

export function renderStageErrorCardView(model: StageErrorCardModel): void {
  const banner = document.getElementById('fail-banner')!;
  banner.style.display = 'block';
  banner.textContent = '';
  banner.className = 'banner error';

  const wrap = document.createElement('div');
  wrap.className = 'error-card';

  const techDetails = appendErrorCardHeader(wrap, model);
  const panels = appendErrorCardExpandPanels(wrap, model, techDetails);
  banner.appendChild(wrap);

  mountErrorCardDockActions(model, panels);
}
