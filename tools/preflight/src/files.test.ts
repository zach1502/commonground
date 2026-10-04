import { describe, expect, it } from 'vitest';

import { isScannable, lineOf, listRepoFiles, packageOf, readJson } from './files.js';
import { fixtureDir, REPO_ROOT } from './testing/fixture-context.js';

describe('files', () => {
  it('lists repo files without fixtures, installs or build output', () => {
    const files = listRepoFiles(REPO_ROOT);
    expect(files).toContain('AGENTS.md');
    expect(files.some((file) => file.startsWith('tools/preflight/fixtures/'))).toBe(false);
    expect(files.some((file) => file.includes('node_modules/'))).toBe(false);
    expect(listRepoFiles(REPO_ROOT)).toBe(files);
  });

  it('filters git paths the same way', () => {
    expect(isScannable('apps/web/src/a.ts')).toBe(true);
    expect(isScannable('apps/web/dist/a.js')).toBe(false);
    expect(isScannable('tools/preflight/fixtures/rules/a.ts')).toBe(false);
  });

  it('names the package a file belongs to', () => {
    expect(packageOf('packages/core/src/a.ts')).toBe('packages/core');
    expect(packageOf('tools/preflight/src/cli.ts')).toBe('tools/preflight');
    expect(packageOf('packages/README.md')).toBe('.');
    expect(packageOf('eslint.config.js')).toBe('.');
  });

  it('turns offsets into line numbers and reads optional JSON', () => {
    expect(lineOf('a\nb\nc', 4)).toBe(3);
    expect(readJson(fixtureDir('file-budget', 'pass'), 'missing.json')).toBeUndefined();
  });
});
