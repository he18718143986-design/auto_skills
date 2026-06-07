import { buildStageErrorCardModel, type StageErrorCardMessage } from './error-card/ErrorCardModel';
import { renderStageErrorCardView } from './error-card/ErrorCardView';

export function renderStageErrorCard(msg: StageErrorCardMessage): void {
  renderStageErrorCardView(buildStageErrorCardModel(msg));
}
