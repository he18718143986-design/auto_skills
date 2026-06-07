#!/usr/bin/env node
/**
 * 一次性迁移：从 WorkflowPrompts.ts 提取 const/export const 模板字符串到 prompts/*.md
 * 用法：node scripts/extract-prompts-from-workflow-prompts.mjs
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src', 'WorkflowPrompts.ts');
const PROMPTS_DIR = path.join(ROOT, 'prompts');

const EXTRACT_MAP = [
  { export: 'DECISION_RECORD_STRICT_SUFFIX', file: 'decision-record-strict-suffix.md' },
  { export: 'RULE20_SYSTEM_PROMPT_TEXT', file: 'rule20-system.md', slot: 'RULE20_SYSTEM_PROMPT', protected: false },
  { export: 'ENGINEERING_TEST_STRATEGY_BORROWING_TEXT', file: 'engineering-test-strategy-borrowing.md' },
  { export: 'PYTHON_CODE_RUNNER_CONSTRAINT_TEXT', file: 'python-code-runner-constraint.md' },
  { export: 'PROTOTYPE_MULTI_FILE_WRITE_TEXT', file: 'prototype-multi-file-write.md' },
  { export: 'ARTIFACT_INPUT_ALIGNMENT_TEXT', file: 'artifact-input-alignment.md' },
  { export: 'MAIN_ASSEMBLY_NAMING_TEXT', file: 'main-assembly-naming.md' },
  { export: 'TEST_INFRASTRUCTURE_BEFORE_TEST_RUN_TEXT', file: 'test-infrastructure-before-test-run.md' },
  { export: 'PROTOTYPE_EXCEL_FIXTURE_ALIGNMENT_TEXT', file: 'prototype-excel-fixture-alignment.md' },
  { export: 'VERTICAL_SLICE_CONSTRAINT_TEXT', file: 'vertical-slice-constraint.md', slot: 'VERTICAL_SLICE_CONSTRAINT', protected: false },
  { export: 'SPEC_78_MULTI_MODULE_TEXT', file: 'spec-78-multi-module.md' },
  { export: 'LAYER_1_TO_5_TEXT', file: 'layer-1-to-5.md' },
  { export: 'REFACTOR_CONSTRAINT_TEXT', file: 'task-type/refactor-constraint.md' },
  { export: 'IMPROVE_ARCHITECTURE_CONSTRAINT_TEXT', file: 'task-type/improve-architecture-constraint.md' },
  { export: 'DEBUG_CONSTRAINT_TEXT', file: 'task-type/debug-constraint.md' },
  { export: 'PROTOTYPE_CONSTRAINT_TEXT', file: 'task-type/prototype-constraint.md' },
  { export: 'SPEC_75_ORIGINAL_TEXT', file: 'spec-75-original.md', slot: 'SPEC_75_ORIGINAL_TEXT', protected: true },
  { export: 'GENERATOR_JSON_SCHEMA_BASE', file: 'generator-json-schema-base.md' },
  { export: 'TASK_TYPE_CLASSIFICATION_TEXT', file: 'task-type-classification.md' },
];

function extractConst(source, name) {
  const re = new RegExp(
    `(?:export\\s+)?const\\s+${name}\\s*=\\s*\`([\\s\\S]*?)\`;`,
  );
  const m = source.match(re);
  if (!m) {
    throw new Error(`const not found: ${name}`);
  }
  return m[1];
}

const source = fs.readFileSync(SRC, 'utf8');
fs.mkdirSync(PROMPTS_DIR, { recursive: true });
fs.mkdirSync(path.join(PROMPTS_DIR, 'task-type'), { recursive: true });

const manifestFragments = [];
for (const item of EXTRACT_MAP) {
  const content = extractConst(source, item.export);
  const outPath = path.join(PROMPTS_DIR, item.file);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, content, 'utf8');
  manifestFragments.push({
    export: item.export,
    file: item.file,
    ...(item.slot ? { slot: item.slot, protected: item.protected } : {}),
  });
  console.log(`extracted ${item.export} -> prompts/${item.file}`);
}

const manifest = { version: 1, fragments: manifestFragments };
fs.writeFileSync(path.join(PROMPTS_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log('[extract-prompts] wrote prompts/manifest.json');
