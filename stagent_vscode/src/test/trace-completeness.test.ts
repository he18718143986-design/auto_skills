import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  DEBUG_EVENT_DAG_SCHEDULER_EXIT,
  DEBUG_EVENT_INSTANCE_SWITCH_BLOCKED,
  DEBUG_EVENT_LINEAR_STAGE_SKIP,
  DEBUG_EVENT_RESUME_FAILED,
} from '../DebugLogEvents';

const SRC = path.join(process.cwd(), 'src');

/** Lifecycle events that must accompany status/loop exits (grep guard). */
const TRACE_COMPLETENESS_EVENTS = [
  DEBUG_EVENT_DAG_SCHEDULER_EXIT,
  DEBUG_EVENT_LINEAR_STAGE_SKIP,
  DEBUG_EVENT_RESUME_FAILED,
  DEBUG_EVENT_INSTANCE_SWITCH_BLOCKED,
] as const;

test('trace-completeness taxonomy defines scheduler/resume/switch events', () => {
  for (const ev of TRACE_COMPLETENESS_EVENTS) {
    assert.ok(typeof ev === 'string' && ev.length > 0);
  }
});

test('DagWaveScheduler source emits scheduler exit events', () => {
  const src = fs.readFileSync(path.join(SRC, 'executor-loop/DagWaveScheduler.ts'), 'utf-8');
  assert.ok(src.includes('DEBUG_EVENT_DAG_SCHEDULER_EXIT'));
  assert.ok(src.includes('paused-or-waiting-questions'));
  assert.ok(src.includes('stuck-pending'));
});

test('resume and instance-switch paths emit debug events', () => {
  const resumeSrc = fs.readFileSync(path.join(SRC, 'resume/resumeInstance.ts'), 'utf-8');
  const activateSrc = fs.readFileSync(path.join(SRC, 'resume/activateInstance.ts'), 'utf-8');
  assert.ok(resumeSrc.includes('DEBUG_EVENT_RESUME_FAILED'));
  assert.ok(activateSrc.includes('DEBUG_EVENT_INSTANCE_SWITCH_BLOCKED'));
});

test('linear executor emits skip events for done/skipped stages', () => {
  const src = fs.readFileSync(path.join(SRC, 'executor-loop/StageStepDriver.ts'), 'utf-8');
  assert.ok(src.includes('DEBUG_EVENT_LINEAR_STAGE_SKIP'));
});
