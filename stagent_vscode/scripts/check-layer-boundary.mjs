#!/usr/bin/env node
/**
 * Layer-boundary baseline gate: fail on new violations, allow grandfathered baseline entries.
 */
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_PATH = path.join(ROOT, 'scripts/layer-boundary-baseline.json');
const SCAN_SCRIPT = path.join(ROOT, 'scripts/layer-boundary-scan.mjs');

function violationKey(v) {
  return `${v.kind}:${v.file}:${v.line}:${v.target}`;
}

const scan = spawnSync(process.execPath, [SCAN_SCRIPT], { encoding: 'utf8' });
if (scan.status !== 0) {
  console.error('[check-layer-boundary] scan failed');
  process.exit(scan.status ?? 1);
}

const { violations } = JSON.parse(scan.stdout);
const current = new Set(violations.map(violationKey));

if (!fs.existsSync(BASELINE_PATH)) {
  console.error(`[check-layer-boundary] missing baseline: ${BASELINE_PATH}`);
  process.exit(1);
}

const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
const allowed = new Set(baseline.violations ?? []);

const newOnes = [...current].filter((k) => !allowed.has(k));
const removed = [...allowed].filter((k) => !current.has(k));

if (newOnes.length > 0) {
  console.error('[check-layer-boundary] new violations (not in baseline):');
  for (const k of newOnes) {
    console.error(`  + ${k}`);
  }
}

if (removed.length > 0) {
  console.log('[check-layer-boundary] resolved violations (remove from baseline when intentional):');
  for (const k of removed) {
    console.log(`  - ${k}`);
  }
}

if (newOnes.length > 0) {
  process.exit(1);
}

console.log(
  `[check-layer-boundary] OK (${current.size} violations match baseline; ${removed.length} resolved since baseline)`,
);
