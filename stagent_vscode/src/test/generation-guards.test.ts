import { describe, test } from 'node:test';
import assert from 'node:assert';
import { confirmLargeProjectGeneration } from '../generation/generationGuards';
import type { ConfirmDialog } from '../generation/confirmDialogAdapter';
import { uiMsg } from '../l10n/uiStrings';

describe('confirmLargeProjectGeneration', () => {
  test('returns true without prompting for non-multi-module input', async () => {
    let prompted = false;
    const dialog: ConfirmDialog = async () => {
      prompted = true;
      return undefined;
    };
    const ok = await confirmLargeProjectGeneration('add a button', dialog);
    assert.strictEqual(ok, true);
    assert.strictEqual(prompted, false, 'should not prompt for small tasks');
  });

  test('prompts and returns true when user picks continue', async () => {
    const continueLabel = uiMsg('stagent.action.continueGenerate');
    const dialog: ConfirmDialog = async () => continueLabel;
    const ok = await confirmLargeProjectGeneration('做一个完整项目', dialog);
    assert.strictEqual(ok, true);
  });

  test('prompts and returns false when user cancels or dismisses', async () => {
    const cancelLabel = uiMsg('stagent.action.cancel');
    const cancelDialog: ConfirmDialog = async () => cancelLabel;
    const dismissDialog: ConfirmDialog = async () => undefined;
    assert.strictEqual(await confirmLargeProjectGeneration('full-stack app', cancelDialog), false);
    assert.strictEqual(await confirmLargeProjectGeneration('full-stack app', dismissDialog), false);
  });
});
