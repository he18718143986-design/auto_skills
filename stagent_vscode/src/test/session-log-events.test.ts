import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SESSION_LOG_EVENT_ALL_ATTEMPTS_FAILED,
  SESSION_LOG_EVENT_INPUT_SUMMARY_ERROR,
  SESSION_LOG_EVENT_LLM_END,
  SESSION_LOG_EVENT_LLM_ERROR,
  SESSION_LOG_EVENT_LLM_START,
  SESSION_LOG_EVENT_RESOLVED,
  SESSION_LOG_PURPOSE_LLM_MODEL_SELECT,
} from '../SessionLogEvents';

describe('SessionLogEvents', () => {
  it('keeps stable string values for session log compatibility', () => {
    assert.equal(SESSION_LOG_PURPOSE_LLM_MODEL_SELECT, 'llm-model-select');
    assert.equal(SESSION_LOG_EVENT_LLM_START, 'llm_start');
    assert.equal(SESSION_LOG_EVENT_LLM_END, 'llm_end');
    assert.equal(SESSION_LOG_EVENT_LLM_ERROR, 'llm_error');
    assert.equal(SESSION_LOG_EVENT_INPUT_SUMMARY_ERROR, 'input_summary_error');
    assert.equal(SESSION_LOG_EVENT_RESOLVED, 'resolved');
    assert.equal(SESSION_LOG_EVENT_ALL_ATTEMPTS_FAILED, 'all_attempts_failed');
  });
});
