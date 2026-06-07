#!/usr/bin/env node
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * 在 tmp 下生成 N 个小文件树，供 context-load benchmark 使用。
 * @param {number} fileCount
 * @returns {string} 根目录绝对路径
 */
export function createSyntheticRepo(fileCount = 1000) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stagent-bench-repo-'));
  const src = path.join(root, 'src');
  fs.mkdirSync(src, { recursive: true });
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'bench-repo', version: '1.0.0', private: true }, null, 2),
  );
  for (let i = 0; i < fileCount; i++) {
    const sub = path.join(src, `pkg${Math.floor(i / 100)}`);
    fs.mkdirSync(sub, { recursive: true });
    fs.writeFileSync(
      path.join(sub, `mod_${i}.ts`),
      `export const v${i} = ${i};\nexport function f${i}() { return v${i}; }\n`,
    );
  }
  return root;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const count = Number(process.argv[2] ?? '1000');
  const root = createSyntheticRepo(count);
  console.log(root);
}
