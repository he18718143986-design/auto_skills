#!/usr/bin/env node
/**
 * 关键路径覆盖率门槛（配合 c8 lcov）。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lcovPath = path.join(ROOT, 'coverage/lcov.info');

const THRESHOLDS = [
  { pattern: /WorkflowPersistence\.ts$/, minLines: 70 },
  { pattern: /QualityGateRunner\.ts$/, minLines: 55 },
  { pattern: /Rule20RuntimeGate\.ts$/, minLines: 70 },
  { pattern: /WorkflowEngine\.ts$/, minLines: 18 },
  { pattern: /executeStageStep\.ts$/, minLines: 60 },
  { pattern: /LlmClient\.ts$/, minLines: 50 },
  { pattern: /WorkflowCodeRunnerHost\.ts$/, minLines: 35 },
  { pattern: /BuiltinQualityGates\.ts$/, minLines: 45 },
];

if (!fs.existsSync(lcovPath)) {
  console.warn('[check-critical-coverage] skip: no coverage/lcov.info (run npm run test:coverage first)');
  process.exit(0);
}

const records = fs.readFileSync(lcovPath, 'utf8').split('end_of_record\n');
const files = [];
for (const rec of records) {
  const sf = rec.match(/^SF:(.+)$/m);
  if (!sf) {
    continue;
  }
  const file = sf[1];
  const lh = rec.match(/^LH:(\d+)$/m);
  const lf = rec.match(/^LF:(\d+)$/m);
  if (lh && lf) {
    const hit = Number(lh[1]);
    const total = Number(lf[1]);
    files.push({ file, pct: total === 0 ? 100 : (hit / total) * 100 });
  }
}

let failed = false;
for (const { pattern, minLines } of THRESHOLDS) {
  const match = files.find((f) => pattern.test(f.file));
  if (!match) {
    console.warn(`[check-critical-coverage] skip: no lcov entry for ${pattern}`);
    continue;
  }
  if (match.pct < minLines) {
    console.error(
      `[check-critical-coverage] ${path.basename(match.file)} line coverage ${match.pct.toFixed(1)}% < ${minLines}%`,
    );
    failed = true;
  } else {
    console.log(`[check-critical-coverage] ${path.basename(match.file)} OK (${match.pct.toFixed(1)}%)`);
  }
}

process.exit(failed ? 1 : 0);
