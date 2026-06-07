#!/usr/bin/env node
/**
 * 为 chat 实例工作流注入自修复阶段（verify / verify_imports / fix / npm install）。
 * 用法：node scripts/patch-chat-workflow-self-heal.mjs [path-to-.wf-state.json]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const defaultState = path.join(
  ROOT,
  '..',
  'chat',
  '.stagent',
  'instances',
  '64e35230-5236-4994-8d22-bc830aae1597',
  '.wf-state.json',
);

const statePath = path.resolve(process.argv[2] || defaultState);
if (!fs.existsSync(statePath)) {
  console.error(`state file not found: ${statePath}`);
  process.exit(1);
}

const { injectSelfHealStages, auditSelfHealGaps } = require(path.join(
  ROOT,
  'out/workflow-self-heal/injectSelfHealStages.js',
));

const raw = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const def = raw.instance?.definition;
if (!def?.stages) {
  console.error('invalid wf-state: missing instance.definition.stages');
  process.exit(1);
}

const before = def.stages.length;
const { workflow, insertedStageIds, movedStageIds, violations } = injectSelfHealStages(def);
raw.instance.definition = workflow;

const gaps = auditSelfHealGaps(workflow);
fs.writeFileSync(statePath, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');

console.log(`patched: ${statePath}`);
console.log(`stages: ${before} -> ${workflow.stages.length}`);
console.log(`inserted (${insertedStageIds.length}):`, insertedStageIds.join(', '));
if (movedStageIds.length) {
  console.log(`moved:`, movedStageIds.join(', '));
}
if (violations.length) {
  console.log('violations fixed:');
  for (const v of violations) {
    console.log(`  - ${v}`);
  }
}
if (gaps.length) {
  console.warn('remaining gaps:');
  for (const g of gaps) {
    console.warn(`  - ${g}`);
  }
  process.exit(2);
}
