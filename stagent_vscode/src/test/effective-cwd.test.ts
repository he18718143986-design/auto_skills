import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveEffectiveCodeRunnerCwd,
  stripLeadingCdSegments,
} from '../code-runner/effectiveCwd';

test('resolveEffectiveCodeRunnerCwd: no cd returns baseCwd', () => {
  assert.equal(
    resolveEffectiveCodeRunnerCwd({
      workspaceRoot: '/ws',
      baseCwd: '/ws',
      command: 'npm test',
    }),
    '/ws',
  );
});

test('resolveEffectiveCodeRunnerCwd: cd server joins under workspace root', () => {
  assert.equal(
    resolveEffectiveCodeRunnerCwd({
      workspaceRoot: '/ws',
      baseCwd: '/ws',
      command: 'cd server && npm test',
    }),
    '/ws/server',
  );
});

test('stripLeadingCdSegments: removes leading cd and keeps test command', () => {
  assert.equal(stripLeadingCdSegments('cd server && npm test'), 'npm test');
  assert.equal(stripLeadingCdSegments('npm test'), 'npm test');
  assert.equal(stripLeadingCdSegments('cd server'), ':');
});
