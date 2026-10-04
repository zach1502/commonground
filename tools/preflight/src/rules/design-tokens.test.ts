import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { fakeExec, fixtureContext, fixtureDir, problems } from '../testing/fixture-context.js';

import { parseStylelint, rule } from './design-tokens.js';

describe('design-tokens', () => {
  it('passes motion inside both motion homes and token colours', async () => {
    expect(await problems(rule, fixtureContext(rule.id, 'pass'))).toEqual([]);
  });

  it('fails animation, keyframes and transition outside the motion wrappers', async () => {
    const found = await problems(rule, fixtureContext(rule.id, 'fail'));
    expect(found.map(({ file, line }) => `${file ?? ''}:${String(line)}`).sort()).toEqual([
      'apps/web/src/pages/home-page.tsx:1',
      'apps/web/src/pages/home-page.tsx:2',
      'apps/web/src/pages/home.css:2',
      'apps/web/src/pages/home.css:5',
      'packages/scene/src/components/Fade.tsx:1',
      'packages/scene/src/components/Fade.tsx:2',
    ]);
  });

  it('reports an info finding when stylelint is not installed', async () => {
    const rootDir = mkdtempSync(path.join(tmpdir(), 'preflight-tokens-'));
    writeFileSync(path.join(rootDir, 'a.css'), 'a {\n}\n');
    const ctx = { ...fixtureContext(rule.id, 'pass'), rootDir, files: ['a.css'] };
    expect(await rule.check(ctx)).toEqual([expect.objectContaining({ severity: 'info' })]);
  });

  it('turns stylelint warnings into findings', async () => {
    const source = path.join(fixtureDir(rule.id, 'pass'), 'apps/web/src/pages/home.css');
    const stderr = JSON.stringify([
      {
        source,
        warnings: [
          { line: 2, text: 'Use a token', severity: 'error' },
          { text: 'minor', severity: 'warning' },
        ],
      },
    ]);
    const exec = fakeExec({ code: 2, stderr });
    const findings = await rule.check(fixtureContext(rule.id, 'pass', { exec }));
    expect(findings).toEqual([
      {
        ruleId: rule.id,
        file: 'apps/web/src/pages/home.css',
        line: 2,
        message: 'Use a token',
        severity: 'error',
      },
      { ruleId: rule.id, file: 'apps/web/src/pages/home.css', message: 'minor', severity: 'warn' },
    ]);
  });

  it('parses stylelint JSON output and tolerates noise', () => {
    const output =
      'noise\n[{"source":"/r/a.css","warnings":[{"line":2,"text":"x","severity":"error"}]}]';
    expect(parseStylelint(output)).toHaveLength(1);
    expect(parseStylelint('no json here')).toEqual([]);
    expect(parseStylelint('[broken')).toEqual([]);
  });
});
