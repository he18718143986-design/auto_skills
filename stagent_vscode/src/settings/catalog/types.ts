export type SettingsDomain =
  | 'plan'
  | 'execution'
  | 'grill'
  | 'tdd'
  | 'memory'
  | 'hitl'
  | 'debug'
  | 'llm'
  | 'core';

export interface SettingDomainEntry {
  key: string;
  defaultSummary: string;
  effect: string;
}
