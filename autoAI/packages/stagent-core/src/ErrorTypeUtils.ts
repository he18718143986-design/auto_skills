import type { ErrorType } from './WorkflowDefinition';

const KNOWN_ERROR_TYPES = new Set<string>([
  'llm-timeout',
  'llm-context-overflow',
  'llm-invalid-output',
  'llm-refusal',
  'llm-quality-below-threshold',
  'tool-execution-failed',
  'code-runner-timeout',
  'file-not-found',
  'stage-not-found',
  'invariant-violation',
  'retry-limit-exceeded',
  'sandbox-network-blocked',
  'sandbox-memory-exceeded',
  'static-analysis-failed',
  'confidence-too-low',
  'unknown',
]);

/** 旧 JSON / 外部消息缺少新 ErrorType 时回落 `unknown`。 */
export function normalizeErrorType(raw: unknown): ErrorType {
  if (typeof raw === 'string' && KNOWN_ERROR_TYPES.has(raw)) {
    return raw as ErrorType;
  }
  return 'unknown';
}
