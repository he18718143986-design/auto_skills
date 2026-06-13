import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  lintRequirementsTxtContent,
  normalizeRequirementsTxtContent,
} from '../RequirementsTxtNormalize';
import {
  commandInstallsRequirementsTxt,
  lintAndMaybeFixRequirementsTxtOnDisk,
  stageInstallsRequirementsTxt,
} from '../RequirementsTxtPreflight';
import { normalizeLlmOutputForWritePath } from '../WriteOutputNormalize';

test('normalizeRequirementsTxtContent fixes ctpbee>=8.1.0 hallucination', () => {
  const raw = 'ctpbee>=8.1.0\nnumpy>=1.24\n';
  const { content, fixes } = normalizeRequirementsTxtContent(raw);
  assert.equal(fixes.length, 1);
  assert.equal(fixes[0]!.before, 'ctpbee>=8.1.0');
  assert.equal(fixes[0]!.after, 'ctpbee>=1.7.3,<2');
  assert.ok(content.includes('ctpbee>=1.7.3,<2'));
  assert.ok(content.includes('numpy>=1.24'));
});

test('lintRequirementsTxtContent flags impossible ctpbee pin', () => {
  const issues = lintRequirementsTxtContent('ctpbee>=8.1.0\n');
  assert.equal(issues.length, 1);
  assert.equal(issues[0]!.code, 'requirements-impossible-pypi-version');
  assert.equal(issues[0]!.line, 1);
});

test('normalizeLlmOutputForWritePath auto-fixes requirements.txt on write', () => {
  const r = normalizeLlmOutputForWritePath('requirements.txt', 'ctpbee>=8.1.0\nTA-Lib\n');
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.ok(r.content.includes('ctpbee>=1.7.3,<2'));
    assert.ok(r.content.includes('TA-Lib'));
  }
});

test('lintAndMaybeFixRequirementsTxtOnDisk auto-writes fix before pip', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stagent-req-'));
  try {
    fs.writeFileSync(path.join(dir, 'requirements.txt'), 'ctpbee>=8.1.0\n', 'utf8');
    const result = lintAndMaybeFixRequirementsTxtOnDisk(dir);
    assert.equal(result.blocked, false);
    assert.equal(result.fixes.length, 1);
    const onDisk = fs.readFileSync(path.join(dir, 'requirements.txt'), 'utf8');
    assert.ok(onDisk.includes('ctpbee>=1.7.3,<2'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('stageInstallsRequirementsTxt detects pip install -r requirements.txt', () => {
  assert.equal(
    stageInstallsRequirementsTxt({
      tool: 'code-runner',
      toolConfig: { type: 'code-runner', command: 'pip install -r requirements.txt' },
    }),
    true,
  );
  assert.equal(commandInstallsRequirementsTxt('python -m pip install -r requirements.txt'), true);
  assert.equal(commandInstallsRequirementsTxt('pip install numpy'), false);
});
