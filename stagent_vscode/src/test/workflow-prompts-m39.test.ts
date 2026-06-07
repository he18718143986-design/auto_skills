import test from 'node:test';
import assert from 'node:assert/strict';
import { PROTOTYPE_CONSTRAINT_TEXT, TEST_INFRASTRUCTURE_BEFORE_TEST_RUN_TEXT } from '../generated/PromptFragments';
import { buildWorkflowGeneratorPrompt } from '../WorkflowPrompts';

test('TEST_INFRASTRUCTURE_BEFORE_TEST_RUN_TEXT mentions M39.1 and plan_incomplete', () => {
  assert.match(TEST_INFRASTRUCTURE_BEFORE_TEST_RUN_TEXT, /M39\.1/);
  assert.match(TEST_INFRASTRUCTURE_BEFORE_TEST_RUN_TEXT, /missing-test-infrastructure/);
  assert.match(TEST_INFRASTRUCTURE_BEFORE_TEST_RUN_TEXT, /stage_impl_jest_config/);
  assert.match(TEST_INFRASTRUCTURE_BEFORE_TEST_RUN_TEXT, /babel\.config/);
});

test('software generator prompt includes test infrastructure block', () => {
  const prompt = buildWorkflowGeneratorPrompt('software', {
    userInput: '完整 Expo React Native TypeScript 项目',
  });
  assert.match(prompt, /TEST INFRASTRUCTURE BEFORE test_run/);
  assert.match(prompt, /20-J/);
  assert.match(prompt, /测试基础设施（M39\.1）/);
});

test('prototype generator prompt includes test infrastructure when Jest path applies', () => {
  const prompt = buildWorkflowGeneratorPrompt('prototype', {
    userInput: 'mobile App.tsx with jest tests',
  });
  assert.match(prompt, /TEST INFRASTRUCTURE BEFORE test_run/);
  assert.match(prompt, /M39\.1/);
});

test('PROTOTYPE_CONSTRAINT_TEXT does not embed full TEST_INFRA block (composed in WorkflowPrompts)', () => {
  assert.doesNotMatch(PROTOTYPE_CONSTRAINT_TEXT, /ORDER \(HARD\): In stages\[\] array order/);
  assert.match(TEST_INFRASTRUCTURE_BEFORE_TEST_RUN_TEXT, /ORDER \(HARD\): In stages\[\] array order/);
});
