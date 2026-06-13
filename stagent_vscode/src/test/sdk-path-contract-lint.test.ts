import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import type { WorkflowDefinition } from '../WorkflowDefinition';
import {
  collectDecisionRecordsFromInstance,
  lintSdkPathContract,
  sdkPathContractIssuesToWarnings,
} from '../SdkPathContractLint';
import { collectWorkflowArtifacts } from '../WorkflowArtifactRegistry';

const META = {
  title: 't',
  taskType: 'software',
  userInput: 'x',
  createdAt: '2026-01-01T00:00:00.000Z',
};

function wfWithPaths(): WorkflowDefinition {
  return {
    id: 'wf',
    version: '2.0',
    meta: META,
    stages: [
      {
        id: 'stage_decide_auth',
        title: 'd',
        tool: 'llm-text',
        toolConfig: { type: 'llm-text', systemPrompt: 'd' },
        input: { sources: [], mergeStrategy: 'concat' },
        outputs: [{ key: 'decisionRecord', format: 'markdown' }],
        isDecisionStage: true,
        pauseAfter: true,
      },
      {
        id: 'stage_impl_auth_service',
        title: 'impl',
        tool: 'llm-text',
        toolConfig: {
          type: 'llm-text',
          systemPrompt: 'impl',
          writeOutputToFile: 'mobile/src/services/auth.ts',
        },
        input: { sources: [], mergeStrategy: 'concat' },
        outputs: [{ key: 'out', format: 'text' }],
        pauseAfter: false,
      },
      {
        id: 'stage_test_auth',
        title: 'test',
        tool: 'llm-text',
        toolConfig: {
          type: 'llm-text',
          systemPrompt: 'test',
          writeOutputToFile: 'mobile/src/services/auth.test.ts',
        },
        input: { sources: [], mergeStrategy: 'concat' },
        outputs: [{ key: 'out', format: 'text' }],
        pauseAfter: false,
      },
    ],
  };
}

test('M39.2: decision firebase-web vs impl @react-native-firebase → decision-impl-sdk-mismatch', () => {
  const wf = wfWithPaths();
  const registry = collectWorkflowArtifacts(wf);
  const issues = lintSdkPathContract({
    workflow: wf,
    registry,
    decisionRecords: [
      {
        stageId: 'stage_decide_auth',
        text: 'Use Firebase Web SDK (`firebase/app`) for auth in Expo project.',
      },
    ],
    files: [
      {
        path: 'mobile/src/services/auth.ts',
        content: "import auth from '@react-native-firebase/auth';\nexport const login = () => auth();",
      },
    ],
  });
  assert.ok(issues.some((i) => i.code === 'decision-impl-sdk-mismatch'));
});

test('M39.2: test mocks firebase/app but impl uses RN firebase → impl-test-sdk-mismatch', () => {
  const wf = wfWithPaths();
  const registry = collectWorkflowArtifacts(wf);
  const issues = lintSdkPathContract({
    workflow: wf,
    registry,
    decisionRecords: [],
    files: [
      {
        path: 'mobile/src/services/auth.ts',
        content: "import auth from '@react-native-firebase/auth';",
      },
      {
        path: 'mobile/src/services/auth.test.ts',
        content: "jest.mock('firebase/app', () => ({}));\nimport { login } from './auth';",
      },
    ],
  });
  assert.ok(issues.some((i) => i.code === 'impl-test-sdk-mismatch'));
});

test('M39.2: Python test unittest.mock import does not false-positive', () => {
  const wf: WorkflowDefinition = {
    id: 'wf_py',
    version: '2.0',
    meta: META,
    stages: [
      {
        id: 'stage_impl_market_connector',
        title: 'impl',
        tool: 'llm-text',
        toolConfig: {
          type: 'llm-text',
          systemPrompt: 'x',
          writeOutputToFile: 'market_connector.py',
        },
        input: { sources: [], mergeStrategy: 'concat' },
        outputs: [{ key: 'out', format: 'text' }],
        pauseAfter: false,
      },
      {
        id: 'stage_test_write_market_connector',
        title: 'test write',
        tool: 'llm-text',
        toolConfig: {
          type: 'llm-text',
          systemPrompt: 'x',
          writeOutputToFile: 'tests/test_market_connector.py',
        },
        input: { sources: [], mergeStrategy: 'concat' },
        outputs: [{ key: 'out', format: 'text' }],
        pauseAfter: false,
      },
    ],
  };
  const registry = collectWorkflowArtifacts(wf);
  const issues = lintSdkPathContract({
    workflow: wf,
    registry,
    decisionRecords: [],
    files: [
      {
        path: 'tests/test_market_connector.py',
        content: [
          'import pytest',
          'import asyncio',
          'from unittest.mock import MagicMock, patch',
          'from market_connector import MarketGateway',
        ].join('\n'),
      },
      { path: 'market_connector.py', content: 'class MarketGateway: pass\n' },
    ],
  });
  assert.ok(!issues.some((i) => i.code === 'test-import-path-not-in-plan' && /unittest/.test(i.message)));
});

test('M39.2: test relative import not in artifact registry', () => {
  const wf = wfWithPaths();
  const registry = collectWorkflowArtifacts(wf);
  const issues = lintSdkPathContract({
    workflow: wf,
    registry,
    decisionRecords: [],
    files: [
      {
        path: 'mobile/src/services/auth.test.ts',
        content: "import { login } from '../lib/missing-module';",
      },
    ],
  });
  assert.ok(issues.some((i) => i.code === 'test-import-path-not-in-plan'));
});

test('M39.2: aligned firebase-rn passes sdk mismatch checks', () => {
  const wf = wfWithPaths();
  const registry = collectWorkflowArtifacts(wf);
  const issues = lintSdkPathContract({
    workflow: wf,
    registry,
    decisionRecords: [
      { stageId: 'stage_decide_auth', text: 'Use @react-native-firebase/auth for mobile.' },
    ],
    files: [
      {
        path: 'mobile/src/services/auth.ts',
        content: "import auth from '@react-native-firebase/auth';",
      },
      {
        path: 'mobile/src/services/auth.test.ts',
        content: "jest.mock('@react-native-firebase/auth', () => ({}));",
      },
    ],
  });
  assert.ok(!issues.some((i) => i.code.endsWith('sdk-mismatch')));
});

test('collectDecisionRecordsFromInstance reads approved outputs', () => {
  const wf = wfWithPaths();
  const records = collectDecisionRecordsFromInstance(wf, [
    { stageId: 'stage_decide_auth', decisionRecord: '# Auth\nUse Expo.' },
  ]);
  assert.equal(records.length, 1);
  assert.match(records[0]!.text, /Expo/);
});

test('sdkPathContractIssuesToWarnings prefixes M39.2', () => {
  const lines = sdkPathContractIssuesToWarnings([
    { code: 'impl-test-sdk-mismatch', message: 'x' },
  ]);
  assert.match(lines[0]!, /M39\.2 impl-test-sdk-mismatch/);
});
