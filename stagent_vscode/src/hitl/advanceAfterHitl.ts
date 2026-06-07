import type * as vscode from 'vscode';
import type { HitlCoordinatorHost } from './HitlCoordinatorHost';

export async function advanceStageAfterHitl(
  host: HitlCoordinatorHost,
  panel: vscode.WebviewPanel,
): Promise<void> {
  await host.executeNextStage(panel);
}
