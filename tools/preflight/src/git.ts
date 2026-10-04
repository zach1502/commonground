import { isTruthyFlag } from './ci.js';
import { isScannable } from './files.js';
import type { Exec, Tier } from './types.js';

export type ChangeScope = 'staged' | 'working-tree' | 'merge-base';

type Env = Readonly<Record<string, string | undefined>>;

// Refs tried in order when looking for the branch point; the root commit is the last resort.
const BASE_REFS = ['origin/main', 'main'];

export interface ChangeSet {
  readonly files: string[];
  readonly scope: ChangeScope;
  /** The commit the change is diffed against; undefined outside the merge-base scope or with no commits. */
  readonly base?: string;
}

export interface RangeCommit {
  readonly sha: string;
  readonly message: string;
  readonly files: readonly string[];
}

function lines(output: string): string[] {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

async function gitLines(exec: Exec, rootDir: string, args: readonly string[]): Promise<string[]> {
  const result = await exec('git', args, { cwd: rootDir });
  return result.code === 0 ? lines(result.stdout) : [];
}

export async function hasHead(exec: Exec, rootDir: string): Promise<boolean> {
  const result = await exec('git', ['rev-parse', '--verify', '--quiet', 'HEAD'], { cwd: rootDir });
  return result.code === 0;
}

/**
 * Staged files for the quick tier (the pre-commit hook). The merge base for the full tier
 * and for any CI run, where the tree is clean and HEAD is already committed. The working
 * tree against HEAD otherwise.
 */
export function changeScopeFor(tier: Tier, env: Env): ChangeScope {
  if (tier === 'full' || isTruthyFlag(env.CI)) {
    return 'merge-base';
  }
  return tier === 'quick' ? 'staged' : 'working-tree';
}

/** CI sets this to the commit before a push, or to a pull request's base commit. */
export const BASE_REF_ENV = 'PARKSHAPE_BASE_REF';

// GitHub sends an all-zero `before` SHA on the first push of a new branch.
const NULL_SHA = /^0+$/;

async function explicitBase(exec: Exec, rootDir: string, env: Env): Promise<string | undefined> {
  const ref = env[BASE_REF_ENV]?.trim();
  if (ref === undefined || ref === '' || NULL_SHA.test(ref)) {
    return undefined;
  }
  const found = await exec('git', ['cat-file', '-e', `${ref}^{commit}`], { cwd: rootDir });
  return found.code === 0 ? ref : undefined;
}

async function resolveCommit(
  exec: Exec,
  rootDir: string,
  ref: string,
): Promise<string | undefined> {
  const [sha] = await gitLines(exec, rootDir, [
    'rev-parse',
    '--verify',
    '--quiet',
    `${ref}^{commit}`,
  ]);
  return sha;
}

/**
 * The merge base with a base ref. When the ref is HEAD itself, as in CI on a push to main,
 * the merge base would be HEAD and hide the pushed commit, so the parent is used instead.
 */
async function forkPoint(exec: Exec, rootDir: string, ref: string): Promise<string | undefined> {
  const [refSha, [headSha]] = await Promise.all([
    resolveCommit(exec, rootDir, ref),
    gitLines(exec, rootDir, ['rev-parse', '--verify', '--quiet', 'HEAD']),
  ]);
  if (refSha === undefined) {
    return undefined;
  }
  if (refSha === headSha) {
    return resolveCommit(exec, rootDir, 'HEAD~1');
  }
  const [base] = await gitLines(exec, rootDir, ['merge-base', ref, 'HEAD']);
  return base;
}

/**
 * The commit to diff against: PARKSHAPE_BASE_REF when it names a commit, then the fork
 * point with origin/main, then with main, then the root commit.
 */
export async function mergeBase(
  exec: Exec,
  rootDir: string,
  env: Env = {},
): Promise<string | undefined> {
  if (!(await hasHead(exec, rootDir))) {
    return undefined;
  }
  const explicit = await explicitBase(exec, rootDir, env);
  if (explicit !== undefined) {
    return explicit;
  }
  for (const ref of BASE_REFS) {
    const base = await forkPoint(exec, rootDir, ref);
    if (base !== undefined) {
      return base;
    }
  }
  const [root] = await gitLines(exec, rootDir, ['rev-list', '--max-parents=0', 'HEAD']);
  return root;
}

async function allFiles(exec: Exec, rootDir: string): Promise<string[]> {
  const untracked = await gitLines(exec, rootDir, ['ls-files', '--others', '--exclude-standard']);
  // With no commits yet, every tracked or untracked file counts as changed.
  const tracked = await gitLines(exec, rootDir, ['ls-files']);
  return [...tracked, ...untracked];
}

async function changesSince(exec: Exec, rootDir: string, commit: string): Promise<string[]> {
  // Diffing a commit against the working tree covers committed, staged and unstaged edits.
  const changed = await gitLines(exec, rootDir, ['diff', '--name-only', commit]);
  const untracked = await gitLines(exec, rootDir, ['ls-files', '--others', '--exclude-standard']);
  return [...changed, ...untracked];
}

function tidy(files: readonly string[]): string[] {
  return [...new Set(files)].filter(isScannable).sort();
}

async function scopedChanges(
  exec: Exec,
  rootDir: string,
  run: { readonly scope: ChangeScope; readonly env: Env },
): Promise<{ files: string[]; base?: string }> {
  const { scope } = run;
  if (scope === 'staged') {
    const staged = ['diff', '--cached', '--name-only', '--diff-filter=ACMR'];
    return { files: await gitLines(exec, rootDir, staged) };
  }
  const base = scope === 'merge-base' ? await mergeBase(exec, rootDir, run.env) : undefined;
  if (base !== undefined) {
    return { files: await changesSince(exec, rootDir, base), base };
  }
  return (await hasHead(exec, rootDir))
    ? { files: await changesSince(exec, rootDir, 'HEAD') }
    : { files: await allFiles(exec, rootDir) };
}

/** Files the current change touches for a scope, repo-relative and sorted. */
export async function changedFiles(
  exec: Exec,
  rootDir: string,
  scope: ChangeScope,
): Promise<string[]> {
  return tidy((await scopedChanges(exec, rootDir, { scope, env: {} })).files);
}

/** The changed files for a tier, with the merge base when the tier diffs against one. */
export async function changedFilesForTier(
  exec: Exec,
  rootDir: string,
  run: { readonly tier: Tier; readonly env: Env },
): Promise<ChangeSet> {
  const scope = changeScopeFor(run.tier, run.env);
  const { files, base } = await scopedChanges(exec, rootDir, { scope, env: run.env });
  return { files: tidy(files), scope, ...(base === undefined ? {} : { base }) };
}

/** Each commit after `base` up to HEAD, oldest first, with its message and changed files. */
export async function commitsSince(
  exec: Exec,
  rootDir: string,
  base: string,
): Promise<RangeCommit[]> {
  const shas = await gitLines(exec, rootDir, ['rev-list', '--reverse', `${base}..HEAD`]);
  const commits: RangeCommit[] = [];
  for (const sha of shas) {
    const message = await exec('git', ['log', '-1', '--format=%B', sha], { cwd: rootDir });
    const files = await gitLines(exec, rootDir, [
      'diff-tree',
      '--no-commit-id',
      '--name-only',
      '-r',
      sha,
    ]);
    commits.push({ sha, message: message.code === 0 ? message.stdout : '', files });
  }
  return commits;
}
