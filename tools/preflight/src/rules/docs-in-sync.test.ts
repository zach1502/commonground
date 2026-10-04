import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { fixtureContext, fixtureDir, problems } from '../testing/fixture-context.js';

import { firstDifferentLine, rule } from './docs-in-sync.js';

describe('docs-in-sync', () => {
  it('passes when every generated block matches the rules', async () => {
    expect(await problems(rule, fixtureContext(rule.id, 'pass'))).toEqual([]);
  });

  it('fails a stale generated block', async () => {
    const found = await problems(rule, fixtureContext(rule.id, 'fail'));
    expect(found).toEqual([expect.objectContaining({ file: 'DESIGN.md', line: 7 })]);
  });

  it('fails when a rule id changes', async () => {
    const renamed = { ...rule, id: 'docs-in-sync-renamed', doc: 'DESIGN.md#generated-rules' };
    const found = await problems(rule, fixtureContext(rule.id, 'pass', { rules: [renamed] }));
    expect(found).toHaveLength(1);
  });

  it('finds the first differing line, including when one text is a prefix of the other', () => {
    expect(firstDifferentLine('a\nb\nc', 'a\nx\nc')).toBe(2);
    expect(firstDifferentLine('a', 'a\nb')).toBe(2);
    expect(firstDifferentLine('a\nb', 'a')).toBe(2);
    expect(firstDifferentLine('a\nb\n', 'a\nb')).toBe(3);
  });

  it('fails a doc whose marker block was deleted', async () => {
    const rootDir = mkdtempSync(path.join(tmpdir(), 'preflight-markers-'));
    cpSync(fixtureDir(rule.id, 'pass'), rootDir, { recursive: true });
    const design = path.join(rootDir, 'DESIGN.md');
    const withoutBlock = readFileSync(design, 'utf8').replace(
      /<!-- preflight:begin[\s\S]*<!-- preflight:end -->/,
      '',
    );
    writeFileSync(design, withoutBlock);
    const found = await problems(rule, { ...fixtureContext(rule.id, 'pass'), rootDir });
    expect(found).toEqual([
      expect.objectContaining({
        file: 'DESIGN.md',
        message: 'no generated block for section design',
      }),
    ]);
  });

  it('fails a begin marker with no end marker', async () => {
    const rootDir = mkdtempSync(path.join(tmpdir(), 'preflight-markers-'));
    cpSync(fixtureDir(rule.id, 'pass'), rootDir, { recursive: true });
    const design = path.join(rootDir, 'DESIGN.md');
    writeFileSync(design, readFileSync(design, 'utf8').replace('<!-- preflight:end -->', ''));
    const found = await problems(rule, { ...fixtureContext(rule.id, 'pass'), rootDir });
    expect(found.map(({ message }) => message)).toContain(
      'begin marker for section design has no end marker',
    );
  });
});
