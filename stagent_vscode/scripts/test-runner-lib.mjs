import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const testDir = path.join(ROOT, 'out', 'test');

/**
 * @param {{ mode: 'unit' | 'integration' | 'all' }} opts
 */
export async function listTestFiles({ mode }) {
  const entries = await readdir(testDir);
  return entries
    .filter((f) => {
      if (!f.endsWith('.test.js')) {
        return false;
      }
      const isIntegration = f.includes('integration');
      if (mode === 'all') {
        return true;
      }
      if (mode === 'unit') {
        return !isIntegration;
      }
      if (mode === 'integration') {
        return isIntegration;
      }
      return true;
    })
    .sort()
    .map((f) => path.join(testDir, f));
}

/**
 * @param {string[]} files
 * @param {{ coverage?: boolean; label: string }} opts
 */
export function runTestFiles(files, { coverage = false, label }) {
  if (files.length === 0) {
    console.error(`[${label}] no test files in`, testDir);
    return 1;
  }

  const vscodeStubPath = path.join(testDir, 'install-vscode-stub.js');
  const l10nStubPath = path.join(testDir, 'install-webview-l10n-stub.js');
  const importFlags = ['--import', vscodeStubPath, '--import', l10nStubPath];
  const cmd = coverage ? 'c8' : process.execPath;
  const args = coverage
    ? ['--check-coverage', 'false', 'node', ...importFlags, '--test', ...files]
    : [...importFlags, '--test', ...files];
  const result = spawnSync(cmd, args, { stdio: 'inherit' });
  return result.status ?? 1;
}
