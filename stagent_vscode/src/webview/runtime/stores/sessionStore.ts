import type { SessionState } from './types';

export const sessionStore: SessionState = {
  sessionId: null,
  draftInstanceKey: null,
  activeInstanceKey: null,
};

export function resetSessionStore(): void {
  sessionStore.sessionId = null;
  sessionStore.draftInstanceKey = null;
  sessionStore.activeInstanceKey = null;
}
