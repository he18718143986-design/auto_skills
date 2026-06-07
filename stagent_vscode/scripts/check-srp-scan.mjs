#!/usr/bin/env node
/**
 * SRP heuristic hard gates (aligns with docs/architecture.md).
 */
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_SCRIPT = path.join(ROOT, 'scripts/srp-scan.mjs');

const MAX_LONG_FUNCS = 3;
const MAX_MULTI_CONCERN_FILES = 6;

const scan = spawnSync(process.execPath, [SCAN_SCRIPT], { encoding: 'utf8' });
if (scan.status !== 0) {
  console.error('[check-srp-scan] scan failed');
  process.exit(scan.status ?? 1);
}

const { manyMethods, longFuncs, multiConcern } = JSON.parse(scan.stdout);
let failed = false;

if (manyMethods.length > 0) {
  console.error(`[check-srp-scan] classes/objects with >20 methods: ${manyMethods.length}`);
  for (const m of manyMethods) {
    console.error(`  ${m.file} ${m.name} (${m.count})`);
  }
  failed = true;
}

if (longFuncs.length > MAX_LONG_FUNCS) {
  console.error(`[check-srp-scan] functions >80 lines: ${longFuncs.length} (max ${MAX_LONG_FUNCS})`);
  for (const f of longFuncs) {
    console.error(`  ${f.file} ${f.name} (${f.lines})`);
  }
  failed = true;
} else if (longFuncs.length > 0) {
  console.log(`[check-srp-scan] longFuncs within budget (${longFuncs.length}/${MAX_LONG_FUNCS})`);
}

if (multiConcern.length > MAX_MULTI_CONCERN_FILES) {
  console.error(
    `[check-srp-scan] multiConcern files: ${multiConcern.length} (max ${MAX_MULTI_CONCERN_FILES})`,
  );
  for (const m of multiConcern) {
    console.error(`  ${m.file} (${m.count} concerns)`);
  }
  failed = true;
} else if (multiConcern.length > 0) {
  console.log(`[check-srp-scan] multiConcern within budget (${multiConcern.length}/${MAX_MULTI_CONCERN_FILES})`);
}

if (failed) {
  process.exit(1);
}

console.log('[check-srp-scan] OK');
