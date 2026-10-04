import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildReminders, MAX_REMINDER_LINES, pathReminders, REMINDERS_FILE } from './reminders.js';
import { REPO_ROOT } from './testing/fixture-context.js';

const NOW_MS = Date.parse('2026-09-25T00:00:00Z');
// Built from parts so preflight's own debt scan does not count this test data.
const PLACEHOLDER = ['<!-- TO', 'DO(#seed): text -->\n'].join('');
const DISABLE = ['// eslint', 'disable-next-line x -- why (#1)\n'].join('-');
// Reads every file in the real repo, which takes tens of seconds when turbo tests all packages at once.
const REPO_SCAN_TIMEOUT_MS = 60_000;
const OLD_SECONDS = Date.parse('2026-01-01T00:00:00Z') / 1000;

function write(rootDir: string, file: string, text: string): void {
  mkdirSync(path.dirname(path.join(rootDir, file)), { recursive: true });
  writeFileSync(path.join(rootDir, file), text);
}

function debtRepo(): string {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'preflight-reminders-'));
  write(
    rootDir,
    REMINDERS_FILE,
    JSON.stringify([{ globs: ['packages/core/**'], lines: ['Core line.'] }]),
  );
  write(rootDir, 'packages/db/seed/a.md', PLACEHOLDER);
  write(rootDir, 'packages/db/src/a.test.ts', "it.skip('x @quarantine', () => {});\n");
  write(rootDir, 'packages/db/src/b.ts', DISABLE);
  write(rootDir, 'packages/db/src/__live__/pg.json', '{}\n');
  utimesSync(path.join(rootDir, 'packages/db/src/__live__/pg.json'), OLD_SECONDS, OLD_SECONDS);
  return rootDir;
}

describe('buildReminders', () => {
  it('prints path reminders, debt lines and the tier closer in order', () => {
    const lines = buildReminders({
      rootDir: debtRepo(),
      changedFiles: ['packages/core/src/a.ts'],
      tier: 'standard',
      nowMs: NOW_MS,
    });
    expect(lines).toEqual([
      'REMINDERS',
      '- Core line.',
      '- Seed placeholders left: 1.',
      '- Quarantined tests: 1. Fix or delete them.',
      '- Disable comments per package: packages/db 1/5.',
      '- Live fixtures older than 30 days: 1. Rerun the @live tests.',
      '- Did the test fail first?',
    ]);
  });

  it(
    'caps the block at 12 lines and keeps the full-tier checklist',
    () => {
      const lines = buildReminders({
        rootDir: REPO_ROOT,
        changedFiles: [
          'apps/web/src/locales/en.json',
          'packages/core/a.ts',
          'packages/db/a.ts',
          'packages/scene/a.ts',
          'apps/api/a.ts',
          'x.md',
          'packages/ui/src/adapters/a.ts',
        ],
        tier: 'full',
        nowMs: NOW_MS,
      });
      expect(lines).toHaveLength(MAX_REMINDER_LINES);
      expect(lines.at(-1)).toBe(
        '- Done: every box in the PR template checklist is ticked or explained.',
      );
      expect(lines.join('\n')).not.toContain(String.fromCharCode(27));
    },
    REPO_SCAN_TIMEOUT_MS,
  );
});

describe('buildReminders notices and limits', () => {
  it('adds notices such as a skipped secret scan before the tier closer', () => {
    const rootDir = mkdtempSync(path.join(tmpdir(), 'preflight-notices-'));
    const notice = 'gitleaks is not installed; secret scan skipped';
    expect(
      buildReminders({
        rootDir,
        changedFiles: [],
        tier: 'standard',
        nowMs: NOW_MS,
        notices: [notice],
      }),
    ).toEqual(['REMINDERS', `- ${notice}`, '- Did the test fail first?']);
  });

  it('prints only the header when nothing applies', () => {
    const rootDir = mkdtempSync(path.join(tmpdir(), 'preflight-empty-'));
    expect(buildReminders({ rootDir, changedFiles: [], nowMs: NOW_MS })).toEqual(['REMINDERS']);
  });

  it('deduplicates lines matched by several files', () => {
    const entries = [{ globs: ['a/**', 'b/**'], lines: ['Same.'] }];
    expect(pathReminders(entries, ['a/1', 'b/2'])).toEqual(['Same.']);
  });
});
