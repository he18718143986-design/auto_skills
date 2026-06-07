import type * as vscode from 'vscode';
import type { ExecuteNextStageLoopParams } from '../WorkflowExecutor';
import { readGrillAdaptiveModeForStage } from '../GrillAdaptiveFlow';
import { getStagentConfiguration } from '../settings/getStagentConfiguration';
import { tryAnswerFromCodeExplore } from '../GrillCodeExplore';
import { buildHITLPolicy } from '../AdaptiveHITLPolicy';
import type { WorkflowEngineExecutionHost } from './types';
import { qualityGateSettingsReaders } from './quality-gate-settings';

export function buildQualityGateHitlBindings(
  engine: WorkflowEngineExecutionHost,
): Pick<ExecuteNextStageLoopParams, 'confidencePauseThreshold' | 'hitlPolicy' | 'isAdaptiveGrillForStage' | 'tryGrillCodeExplore'> {
  const readers = qualityGateSettingsReaders;
  const e = engine;
  return {
    confidencePauseThreshold: readers.readConfidencePauseThreshold(),
    hitlPolicy: buildHITLPolicy({
      confidencePauseThreshold: readers.readConfidencePauseThreshold(),
      contractNodePauseThreshold: readers.readContractNodePauseThreshold(),
      pauseContractNodesBelowThreshold: readers.readPauseContractNodesEnabled(),
    }),
    isAdaptiveGrillForStage: (stage) => {
      if (!e.instance) {
        return false;
      }
      return readGrillAdaptiveModeForStage({
        cfg: getStagentConfiguration(),
        isDecisionStage: !!stage.isDecisionStage,
        questionBefore: stage.questionBefore,
        workflow: e.instance.definition,
        stage,
      });
    },
    tryGrillCodeExplore: async (question) =>
      tryAnswerFromCodeExplore(question, e.getWorkspaceRootAbsolute()),
  };
}
