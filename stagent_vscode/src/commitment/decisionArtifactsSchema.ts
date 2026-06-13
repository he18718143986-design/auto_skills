export interface DecisionArtifactFileV1 {
  key: string;
  path: string;
  format: string;
  content: string;
}

export interface DecisionArtifactsV1 {
  version: 1;
  files: DecisionArtifactFileV1[];
  modules?: Array<{ name: string; exports: string[] }>;
  testStack?: 'pytest' | 'jest' | 'vitest';
}

export function isDecisionArtifactsV1(value: unknown): value is DecisionArtifactsV1 {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const o = value as DecisionArtifactsV1;
  return o.version === 1 && Array.isArray(o.files);
}
