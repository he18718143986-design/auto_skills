import { STAGENT_DIR } from '../paths/StagentPaths';

/** 工作区目录遍历时的默认跳过目录名（并集：代码快照 / 依赖图 / 实例磁盘索引）。 */
export const DEFAULT_WORKSPACE_SKIP_DIR_NAMES: ReadonlySet<string> = new Set([
  'node_modules',
  '.git',
  'out',
  'dist',
  'coverage',
  STAGENT_DIR,
  'build',
  '.next',
  '.venv',
  '__pycache__',
]);
