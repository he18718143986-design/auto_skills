#!/usr/bin/env ts-node
/**
 * 聚合失败日志（.wf-failures.jsonl 或集中式 failures.jsonl），输出高频 stageId / errorType。
 *
 * 用法：
 *   ts-node scripts/analyze-failures.ts --file <path/to/failures.jsonl> [--top 10] [--format markdown|json]
 *
 * 集中式日志默认位置（由扩展写入 globalStorage，扩展 ID `stagent.stagent`）：
 *   `<globalStorage>/failure-logs/failures.jsonl`（目录名见 `StagentPaths.GLOBAL_FAILURE_LOGS_DIR`）
 *   macOS Cursor 示例：~/Library/Application Support/Cursor/User/globalStorage/stagent.stagent/failure-logs/failures.jsonl
 */
import * as fs from 'fs';
import * as path from 'path';

interface CliOptions {
  file?: string;
  top: number;
  format: 'markdown' | 'json';
}

interface FailureRecord {
  stageId?: string;
  stageTitle?: string;
  tool?: string;
  taskType?: string;
  errorType?: string;
  retryCount?: number;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { top: 10, format: 'markdown' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--file') {
      opts.file = argv[i + 1];
      i += 1;
    } else if (a === '--top') {
      opts.top = Number(argv[i + 1]);
      i += 1;
    } else if (a === '--format') {
      opts.format = argv[i + 1] as 'markdown' | 'json';
      i += 1;
    }
  }
  return opts;
}

function countBy(records: FailureRecord[], key: keyof FailureRecord): Array<[string, number]> {
  const map = new Map<string, number>();
  for (const r of records) {
    const v = String(r[key] ?? 'unknown');
    map.set(v, (map.get(v) ?? 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.file) {
    console.error('Missing --file <path/to/failures.jsonl>');
    process.exit(1);
  }
  const filePath = path.resolve(opts.file);
  if (!fs.existsSync(filePath)) {
    console.error(`No failures log at ${filePath}`);
    process.exit(1);
  }
  const records: FailureRecord[] = fs
    .readFileSync(filePath, 'utf-8')
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => {
      try {
        return JSON.parse(l) as FailureRecord;
      } catch {
        return {};
      }
    });

  const byStage = countBy(records, 'stageId').slice(0, opts.top);
  const byErrorType = countBy(records, 'errorType');

  if (opts.format === 'json') {
    console.log(JSON.stringify({ total: records.length, byStage, byErrorType }, null, 2));
  } else {
    console.log(`# 失败日志聚合（共 ${records.length} 条）\n`);
    console.log('## 高频失败阶段（stageId）');
    for (const [stage, count] of byStage) {
      console.log(`- ${String(count).padStart(4)}x  ${stage}`);
    }
    console.log('\n## 高频错误类型（errorType）');
    for (const [etype, count] of byErrorType) {
      console.log(`- ${String(count).padStart(4)}x  ${etype}`);
    }
  }
  process.exit(0);
}

main();
