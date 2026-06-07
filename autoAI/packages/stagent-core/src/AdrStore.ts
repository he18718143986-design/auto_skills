/**
 * M24：轻量 ADR（Architecture Decision Record）留存（借鉴 skills `grill-with-docs`
 * 的 ADR-FORMAT 与 `docs/adr/0001-...md`）。
 *
 * 决策阶段批准时，可把 decisionRecord 的关键取舍落成一条编号 ADR，存进
 * `.stagent/adr/NNNN-<slug>.md`，形成可追溯的架构决策档案。
 *
 * 纯函数：编号 / 文件名 / 渲染 / 从已有文件名解析编号。
 */

export type AdrStatus = 'proposed' | 'accepted' | 'superseded';

export interface AdrRecord {
  number: number;
  title: string;
  status: AdrStatus;
  date: string;
  context: string;
  decision: string;
  consequences: string;
}

/** 把任意标题压成 ADR 文件名 slug（小写、连字符、ASCII 友好）。 */
export function slugifyAdrTitle(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'decision';
}

/** 4 位补零编号。 */
export function formatAdrNumber(n: number): string {
  return String(Math.max(0, Math.trunc(n))).padStart(4, '0');
}

/** `.stagent/adr/NNNN-<slug>.md` 的文件名（不含目录）。 */
export function adrFileName(adr: Pick<AdrRecord, 'number' | 'title'>): string {
  return `${formatAdrNumber(adr.number)}-${slugifyAdrTitle(adr.title)}.md`;
}

/** 从已有 ADR 文件名中提取编号，返回下一个可用编号（从 1 起）。 */
export function nextAdrNumber(existingFileNames: string[]): number {
  let max = 0;
  for (const name of existingFileNames) {
    const m = /^(\d{1,6})-/.exec(name.trim());
    if (m) {
      max = Math.max(max, Number(m[1]));
    }
  }
  return max + 1;
}

/** 渲染 ADR Markdown（与 skills ADR-FORMAT 对齐：Status / Context / Decision / Consequences）。 */
export function renderAdrMarkdown(adr: AdrRecord): string {
  return [
    `# ${formatAdrNumber(adr.number)}. ${adr.title}`,
    '',
    `- Status: ${adr.status}`,
    `- Date: ${adr.date}`,
    '',
    '## Context',
    '',
    adr.context.trim(),
    '',
    '## Decision',
    '',
    adr.decision.trim(),
    '',
    '## Consequences',
    '',
    adr.consequences.trim(),
    '',
  ].join('\n');
}
