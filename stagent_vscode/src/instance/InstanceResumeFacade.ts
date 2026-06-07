import type * as vscode from 'vscode';
import { buildResumeCoordinatorHost, type EngineHostFactoryDeps } from '../WorkflowEngineHostFactories';
import {
  ensureInstanceBound as ensureInstanceBoundFromModule,
  resumeInstance as resumeInstanceFromModule,
} from '../WorkflowInstanceResumeCoordinator';

export class InstanceResumeFacade {
  constructor(private readonly hostFactoryDeps: () => EngineHostFactoryDeps) {}

  ensureInstanceBound(instanceKey: string | undefined, panel: vscode.WebviewPanel): boolean {
    return ensureInstanceBoundFromModule(buildResumeCoordinatorHost(this.hostFactoryDeps()), instanceKey, panel);
  }

  async resumeInstance(instanceKey: string, panel: vscode.WebviewPanel): Promise<boolean> {
    return resumeInstanceFromModule(buildResumeCoordinatorHost(this.hostFactoryDeps()), instanceKey, panel);
  }
}
