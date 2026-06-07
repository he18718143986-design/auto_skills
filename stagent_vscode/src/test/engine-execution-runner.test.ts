import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { EngineExecutionRunner } from '../EngineExecutionRunner';
import type { WorkflowEngineInternalsHost } from '../WorkflowEngineInternals';

interface HostState {
  depth: number;
  boundPanels: unknown[];
  activePanel: unknown;
  instance: unknown;
}

function makeRunner(overrides?: Partial<HostState>): {
  runner: EngineExecutionRunner;
  state: HostState;
} {
  const state: HostState = {
    depth: 0,
    boundPanels: [],
    activePanel: undefined,
    instance: undefined,
    ...overrides,
  };
  const host = {
    getExecutionDepth: () => state.depth,
    setExecutionDepth: (d: number) => {
      state.depth = d;
    },
    ui: {
      bindPanel: (p: unknown) => state.boundPanels.push(p),
      getActivePanel: () => state.activePanel,
    },
    instances: {
      lifecycle: {
        getInstance: () => state.instance,
      },
    },
    diagnostics: {
      warn: () => {},
    },
  } as unknown as WorkflowEngineInternalsHost;
  return { runner: new EngineExecutionRunner(host), state };
}

test('beginExecutionDepth increments and endExecutionDepth decrements with a floor of 0', () => {
  const { runner, state } = makeRunner();
  runner.beginExecutionDepth();
  runner.beginExecutionDepth();
  assert.equal(state.depth, 2);
  runner.endExecutionDepth();
  assert.equal(state.depth, 1);
  runner.endExecutionDepth();
  runner.endExecutionDepth();
  assert.equal(state.depth, 0, 'depth must not go negative');
});

test('runExecuteNextStageLoop returns early without changing depth when there is no instance', async () => {
  const { runner, state } = makeRunner({ activePanel: {}, instance: undefined });
  await runner.runExecuteNextStageLoop();
  assert.equal(state.depth, 0);
  assert.equal(state.boundPanels.length, 1, 'panel binding still happens before the guard');
});

test('runExecuteNextStageLoop returns early when no panel is available', async () => {
  const { runner, state } = makeRunner({ activePanel: undefined, instance: {} });
  await runner.runExecuteNextStageLoop(undefined);
  assert.equal(state.depth, 0);
});
