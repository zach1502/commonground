import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Path to a binary in the nearest node_modules/.bin at or above rootDir, the way
 * pnpm exec finds it, or undefined when no install has it.
 */
export function resolveBin(rootDir: string, name: string): string | undefined {
  let dir = path.resolve(rootDir);
  for (;;) {
    const candidate = path.join(dir, 'node_modules', '.bin', name);
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
}
