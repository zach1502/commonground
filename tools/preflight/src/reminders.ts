import { statSync } from 'node:fs';
import path from 'node:path';

import { listRepoFiles, readJson, readText, selectFiles } from './files.js';
import { matchesAny } from './glob.js';
import {
  countByPackage,
  directivesIn,
  DISABLE_CAP_PER_PACKAGE,
  DISABLE_GLOBS,
} from './rules/disable-audit.js';
import { seedPlaceholders, todoMarkers, TODO_GLOBS } from './rules/todo-audit.js';
import type { Tier } from './types.js';

export const REMINDERS_FILE = 'tools/preflight/reminders.json';
export const REMINDERS_HEADER = 'REMINDERS';
export const MAX_REMINDER_LINES = 12;
const LIVE_FIXTURE_MAX_AGE_DAYS = 30;
const MS_PER_DAY = 86_400_000;
const QUARANTINE_TAG = /@quarantine\b/g;
const QUARANTINE_GLOBS = ['**/*.test.{ts,tsx,js}', 'e2e/**/*.{ts,tsx}'];

export const TIER_CLOSERS: Readonly<Record<Tier, readonly string[]>> = {
  quick: [],
  standard: ['Did the test fail first?'],
  full: [
    'Done: tests were written first, and all tests are green.',
    'Done: pnpm preflight is green.',
    'Done: for UI work, pnpm e2e passes.',
    'Done: docs that describe the changed behaviour are updated.',
    'Done: every box in the PR template checklist is ticked or explained.',
  ],
};

interface ReminderEntry {
  readonly globs: readonly string[];
  readonly lines: readonly string[];
}

export interface ReminderInput {
  readonly rootDir: string;
  readonly changedFiles: readonly string[];
  /** Omit for runs that do not check anything, such as --explain. */
  readonly tier?: Tier;
  readonly nowMs: number;
  /** Lines about this run, such as a skipped secret scan; they sit before the tier closer. */
  readonly notices?: readonly string[];
}

function loadEntries(rootDir: string): ReminderEntry[] {
  const raw = readJson(rootDir, REMINDERS_FILE);
  return Array.isArray(raw) ? (raw as ReminderEntry[]) : [];
}

/** Reminder lines whose globs match a changed file, in file order, without repeats. */
export function pathReminders(
  entries: readonly ReminderEntry[],
  changedFiles: readonly string[],
): string[] {
  const matched = entries
    .filter(({ globs }) => changedFiles.some((file) => matchesAny(file, globs)))
    .flatMap(({ lines }) => lines);
  return [...new Set(matched)];
}

function placeholderCount(rootDir: string, files: readonly string[]): number {
  const commented = selectFiles(files, TODO_GLOBS).flatMap((file) =>
    todoMarkers(file, readText(rootDir, file)).filter(({ placeholder }) => placeholder),
  );
  const keys = new Set(commented.map(({ file, line }) => `${file}:${String(line)}`));
  for (const { file, line } of seedPlaceholders(rootDir, files)) {
    keys.add(`${file}:${String(line)}`);
  }
  return keys.size;
}

function quarantineCount(rootDir: string, files: readonly string[]): number {
  return selectFiles(files, QUARANTINE_GLOBS, ['tools/preflight/**']).reduce(
    (total, file) => total + [...readText(rootDir, file).matchAll(QUARANTINE_TAG)].length,
    0,
  );
}

function disableLine(rootDir: string, files: readonly string[]): string | undefined {
  const directives = selectFiles(files, DISABLE_GLOBS).flatMap((file) =>
    directivesIn(file, readText(rootDir, file)),
  );
  const counts = [...countByPackage(directives).entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
  if (counts.length === 0) {
    return undefined;
  }
  const parts = counts.map(
    ([pkg, count]) => `${pkg} ${String(count)}/${String(DISABLE_CAP_PER_PACKAGE)}`,
  );
  return `Disable comments per package: ${parts.join(', ')}.`;
}

function staleLiveFixtures(rootDir: string, files: readonly string[], nowMs: number): number {
  const cutoff = nowMs - LIVE_FIXTURE_MAX_AGE_DAYS * MS_PER_DAY;
  return selectFiles(files, ['**/__live__/**']).filter(
    (file) => statSync(path.join(rootDir, file)).mtimeMs < cutoff,
  ).length;
}

/** Debt lines that reflect repo state; each appears only when its count is above zero. */
export function debtLines(rootDir: string, nowMs: number): string[] {
  const files = listRepoFiles(rootDir);
  const placeholders = placeholderCount(rootDir, files);
  const quarantined = quarantineCount(rootDir, files);
  const stale = staleLiveFixtures(rootDir, files, nowMs);
  return [
    placeholders > 0 ? `Seed placeholders left: ${String(placeholders)}.` : undefined,
    quarantined > 0 ? `Quarantined tests: ${String(quarantined)}. Fix or delete them.` : undefined,
    disableLine(rootDir, files),
    stale > 0
      ? `Live fixtures older than ${String(LIVE_FIXTURE_MAX_AGE_DAYS)} days: ${String(stale)}. Rerun the @live tests.`
      : undefined,
  ].filter((line): line is string => line !== undefined);
}

/**
 * The REMINDERS block: path reminders, then debt, then the tier closer, capped at
 * MAX_REMINDER_LINES including the header. Path reminders are trimmed first.
 */
export function buildReminders(input: ReminderInput): string[] {
  const closer = input.tier === undefined ? [] : TIER_CLOSERS[input.tier];
  const debt = [...debtLines(input.rootDir, input.nowMs), ...(input.notices ?? [])];
  const room = MAX_REMINDER_LINES - 1 - closer.length - debt.length;
  const paths = pathReminders(loadEntries(input.rootDir), input.changedFiles).slice(
    0,
    Math.max(0, room),
  );
  const body = [...paths, ...debt, ...closer].slice(0, MAX_REMINDER_LINES - 1);
  return [REMINDERS_HEADER, ...body.map((line) => `- ${line}`)];
}
