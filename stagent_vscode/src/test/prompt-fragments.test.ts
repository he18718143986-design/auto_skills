import test from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as PromptFragments from '../generated/PromptFragments';
import { getManagedPromptSeeds } from '../WorkflowPrompts';

const ROOT = path.resolve(__dirname, '..', '..');
const HASH_FILE = path.join(ROOT, 'src', 'generated', 'prompt-fragments.sha256');

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

test('prompt fragment hashes match committed sha256 manifest', () => {
  const expected = fs.readFileSync(HASH_FILE, 'utf8').trim().split('\n');
  assert.equal(expected.length, PromptFragments.PROMPT_FRAGMENT_EXPORTS.length);
  for (const exportName of PromptFragments.PROMPT_FRAGMENT_EXPORTS) {
    const content = PromptFragments[exportName];
    assert.ok(typeof content === 'string' && content.length > 0, `${exportName} missing`);
    const line = `${exportName}:${sha256(content)}`;
    assert.ok(expected.includes(line), `hash drift for ${exportName}; run npm run build:prompts`);
  }
});

test('getManagedPromptSeeds delegates to prompt fragment slot seeds', () => {
  assert.deepEqual(getManagedPromptSeeds(), PromptFragments.getPromptFragmentSlotSeeds());
});

test('protected PVM slots include decision record suffix', () => {
  const seeds = PromptFragments.getPromptFragmentSlotSeeds();
  assert.equal(seeds.DECISION_RECORD_STRICT_SUFFIX.protected, true);
  assert.equal(seeds.SPEC_75_ORIGINAL_TEXT.protected, true);
  assert.equal(seeds.RULE20_SYSTEM_PROMPT.protected, false);
  assert.equal(seeds.DECISION_RECORD_STRICT_SUFFIX.content, PromptFragments.DECISION_RECORD_STRICT_SUFFIX);
  assert.match(PromptFragments.RULE20_SYSTEM_PROMPT_TEXT, /Rule 20:/);
});
