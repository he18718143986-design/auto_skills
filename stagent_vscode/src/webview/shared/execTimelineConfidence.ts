export type StageConfidenceView = {
  score: number;
  level: string;
  reasons: string[];
};

export function formatConfidenceBar(score: number): string {
  const n = Math.max(0, Math.min(5, Math.round(Number(score) * 5)));
  return '[' + '■'.repeat(n) + '□'.repeat(5 - n) + '] ' + Number(score).toFixed(2);
}

export function confidenceWarn(level: string): string {
  return level === 'low' || level === 'critical' ? ' ⚠' : '';
}

export function confidenceLabel(conf: StageConfidenceView): string {
  return formatConfidenceBar(conf.score) + confidenceWarn(conf.level);
}
