import type { InputState } from './types';

export const inputStore: InputState = {
  committedUserText: '',
  inputBusyOp: null,
  pendingClarifyInput: null,
  genStreamChars: 0,
  genStatusDetailBase: '',
  lastPolishContext: null,
  polishOriginalDraft: '',
  polishTier: 'auto',
  lastPolishTierUsed: null,
  polishToolsExpanded: false,
};

export function resetInputStore(): void {
  inputStore.committedUserText = '';
  inputStore.inputBusyOp = null;
  inputStore.pendingClarifyInput = null;
  inputStore.genStreamChars = 0;
  inputStore.genStatusDetailBase = '';
  inputStore.lastPolishContext = null;
  inputStore.polishOriginalDraft = '';
  inputStore.polishTier = 'auto';
  inputStore.lastPolishTierUsed = null;
  inputStore.polishToolsExpanded = false;
}
