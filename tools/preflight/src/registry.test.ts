import { readdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { findRule, registry } from './registry.js';
import { PACKAGE_DIR } from './testing/fixture-context.js';

const RULES_DIR = path.join(PACKAGE_DIR, 'src', 'rules');
const FIXTURES_DIR = path.join(PACKAGE_DIR, 'fixtures', 'rules');

describe('registry', () => {
  it('lists every rule module once, under its file name', () => {
    const modules = readdirSync(RULES_DIR)
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
      .map((file) => file.replace(/\.ts$/, ''))
      .sort();
    expect(registry.map(({ id }) => id).sort()).toEqual(modules);
  });

  it('gives every rule a test, a pass fixture and a fail fixture', () => {
    for (const { id } of registry) {
      expect(readdirSync(RULES_DIR)).toContain(`${id}.test.ts`);
      expect(readdirSync(path.join(FIXTURES_DIR, id)).sort()).toEqual(['fail', 'pass']);
    }
  });

  it('points every rule at a doc anchor', () => {
    expect(registry.every(({ doc }) => /^[A-Z]+\.md#[a-z0-9-]+$/.test(doc))).toBe(true);
    expect(findRule('nope')).toBeUndefined();
  });
});
