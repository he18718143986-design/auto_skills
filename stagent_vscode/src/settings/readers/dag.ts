import type * as vscode from 'vscode';
import { DEFAULT_DAG_MAX_PARALLELISM, resolveDagMaxParallelism } from '../../StagentSettingsDefaults';
import { readConfigResolved } from './readConfigHelpers';

/** vscode `stagent.dagMaxParallelism` */
export function readDagMaxParallelism(cfg?: vscode.WorkspaceConfiguration): number {
  return readConfigResolved(
    cfg,
    'dagMaxParallelism',
    resolveDagMaxParallelism,
    DEFAULT_DAG_MAX_PARALLELISM,
  );
}
