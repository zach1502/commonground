import { describe, expect, it } from 'vitest';

import { globToRegExp, matchesAny } from './glob.js';

describe('globToRegExp', () => {
  it.each([
    ['packages/*/src/adapters/**', 'packages/db/src/adapters/pg/repo.ts', true],
    ['packages/*/src/adapters/**', 'packages/db/src/repo.ts', false],
    ['**/*.md', 'README.md', true],
    ['**/*.md', 'docs/adr/0001.md', true],
    ['apps/api/src/entry.*.ts', 'apps/api/src/entry.node.ts', true],
    ['apps/api/src/entry.*.ts', 'apps/api/src/sub/entry.node.ts', false],
    ['**/*.{ts,tsx}', 'a/b.tsx', true],
    ['file?.css', 'file1.css', true],
    ['a{b', 'a{b', true],
  ])('%s against %s is %s', (glob, file, expected) => {
    expect(globToRegExp(glob).test(file)).toBe(expected);
  });

  it('matches any of several globs', () => {
    expect(matchesAny('packages/ui/x.ts', ['apps/**', 'packages/ui/**'])).toBe(true);
    expect(matchesAny('tools/x.ts', [])).toBe(false);
  });
});
