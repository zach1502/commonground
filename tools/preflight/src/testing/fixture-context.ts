import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { listRepoFiles } from '../files.js';
import type { Exec, ExecResult, Finding, PreflightRule, RuleContext, Tier } from '../types.js';

export const PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const REPO_ROOT = path.resolve(PACKAGE_DIR, '..', '..');
const RULE_FIXTURES = path.join(PACKAGE_DIR, 'fixtures', 'rules');

export type FixtureKind = 'pass' | 'fail';

/** An Exec that answers every command with the same result, for tests. */
export function fakeExec(result: Partial<ExecResult> = {}): Exec {
  return () => Promise.resolve({ code: 1, stdout: '', stderr: '', ...result });
}

export interface FixtureOptions {
  readonly tier?: Tier;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly exec?: Exec;
  readonly rules?: readonly PreflightRule[];
  /** Defaults to every fixture file, as in a repo with no commits yet. */
  readonly changedFiles?: readonly string[];
  readonly commitMessage?: string;
  readonly commitMessageFile?: string;
  readonly mergeBase?: string;
}

export function fixtureDir(ruleId: string, kind: FixtureKind): string {
  return path.join(RULE_FIXTURES, ruleId, kind);
}

/** `{ key: value }` when the value is set, else `{}`, for exactOptionalPropertyTypes. */
function optional<K extends string>(key: K, value: string | undefined): Partial<Record<K, string>> {
  return value === undefined ? {} : ({ [key]: value } as Partial<Record<K, string>>);
}

/** A RuleContext rooted at a rule's pass or fail fixture. */
export function fixtureContext(
  ruleId: string,
  kind: FixtureKind,
  options: FixtureOptions = {},
): RuleContext {
  const rootDir = fixtureDir(ruleId, kind);
  const files = listRepoFiles(rootDir);
  const tier = options.tier ?? 'standard';
  return {
    rootDir,
    changedFiles: options.changedFiles ?? files,
    files,
    stagedOnly: tier === 'quick',
    tier,
    env: options.env ?? {},
    exec: options.exec ?? fakeExec(),
    rules: options.rules ?? [],
    ...optional('commitMessage', options.commitMessage),
    ...optional('commitMessageFile', options.commitMessageFile),
    ...optional('mergeBase', options.mergeBase),
  };
}

/**
 * Runs a rule on a fixture and returns its findings above info. For error rules these
 * are errors; for warn rules such as constants-home they are warnings.
 */
export async function problems(rule: PreflightRule, ctx: RuleContext): Promise<Finding[]> {
  const findings = await rule.check(ctx);
  return findings.filter((finding) => (finding.severity ?? rule.severity) !== 'info');
}
