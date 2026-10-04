import { changedFiles } from './git.js';
import type { Exec } from './types.js';

/** Turbo arguments for `pnpm test:quick`: coverage off, and no replayed logs from the cache. */
export const TEST_QUICK_ARGS: readonly string[] = [
  '--output-logs=new-only',
  '--',
  '--coverage.enabled=false',
];

const PACKAGE_DIR = /^((?:apps|packages|tools)\/[^/]+)\//;
// Files that every package's tests read, so a change to one runs them all.
const WHOLE_REPO = new Set([
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'turbo.json',
  'tsconfig.base.json',
  'vitest.config.ts',
  'vitest.shared.config.ts',
  'vitest.workspace.ts',
]);

/**
 * Turbo filters for each package a change touches, with the packages that depend on it, or
 * 'all' when a shared file changed. Changes outside the packages, such as docs, select nothing.
 */
export function affectedFilters(paths: readonly string[]): string[] | 'all' {
  if (paths.some((file) => WHOLE_REPO.has(file))) return 'all';
  const dirs = new Set(paths.flatMap((file) => PACKAGE_DIR.exec(file)?.[1] ?? []));
  return [...dirs].map((dir) => `--filter=...{./${dir}}`);
}

export interface TestQuickIo {
  readonly rootDir: string;
  /** Runs git, to list the working-tree changes. */
  readonly exec: Exec;
  /** Runs turbo with its output on the terminal and resolves with the exit code. */
  readonly run: (command: string, args: readonly string[]) => Promise<number>;
  readonly write: (line: string) => void;
}

/**
 * Runs the unit tests of the packages changed in the working tree, and of the packages that
 * depend on them, without coverage. Untracked files count, so it works before the first commit.
 */
export async function runTestQuick(io: TestQuickIo): Promise<number> {
  const filters = affectedFilters(await changedFiles(io.exec, io.rootDir, 'working-tree'));
  if (filters !== 'all' && filters.length === 0) {
    io.write('test:quick: no package changed, so no tests ran');
    return 0;
  }
  const selected = filters === 'all' ? [] : filters;
  io.write(
    `test:quick: turbo run test ${filters === 'all' ? '(every package)' : selected.join(' ')}`,
  );
  return io.run('turbo', ['run', 'test', ...selected, ...TEST_QUICK_ARGS]);
}
