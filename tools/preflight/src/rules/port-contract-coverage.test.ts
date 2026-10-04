import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { fixtureContext, problems } from '../testing/fixture-context.js';

import { adapterExports, rule } from './port-contract-coverage.js';

describe('port-contract-coverage', () => {
  it('passes adapters whose test runs the port contract', async () => {
    expect(await problems(rule, fixtureContext(rule.id, 'pass'))).toEqual([]);
  });

  it('fails an adapter that no contract names', async () => {
    const found = await problems(rule, fixtureContext(rule.id, 'fail'));
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain('S3BlobStore');
  });

  it('warns when a package with adapters has no contracts directory', async () => {
    const rootDir = mkdtempSync(path.join(tmpdir(), 'preflight-ports-'));
    mkdirSync(path.join(rootDir, 'packages/ai/src/adapters'), { recursive: true });
    writeFileSync(
      path.join(rootDir, 'packages/ai/src/adapters/rules-summary.ts'),
      'export class RulesSummary {}\n',
    );
    const ctx = {
      ...fixtureContext(rule.id, 'pass'),
      rootDir,
      files: ['packages/ai/src/adapters/rules-summary.ts'],
    };
    const findings = await rule.check(ctx);
    expect(findings).toEqual([
      expect.objectContaining({ severity: 'warn', file: 'packages/ai/src/ports/__contracts__' }),
    ]);
  });

  it('lists exported classes and create factories', () => {
    const source =
      'export class A {}\nexport function createB() {}\nexport const createC = () => 1;\nexport function helper() {}';
    expect(adapterExports(source)).toEqual(['A', 'createB', 'createC']);
  });
});
