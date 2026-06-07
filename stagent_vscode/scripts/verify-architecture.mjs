#!/usr/bin/env node
/**
 * Architecture gates: SRP heuristics + layer-boundary baseline (CI entry).
 */
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(script) {
  const full = path.join(ROOT, script);
  const result = spawnSync(process.execPath, [full], { stdio: 'inherit' });
  return result.status ?? 1;
}

let code = 0;
if (run('scripts/check-srp-scan.mjs') !== 0) {
  code = 1;
}
if (run('scripts/check-layer-boundary.mjs') !== 0) {
  code = 1;
}

if (code === 0) {
  console.log('[verify:architecture] OK');
}
process.exit(code);
