import { fileExists, packageOf, readText } from '../files.js';
import { changedFiles, commitsSince } from '../git.js';
import { matchesAny } from '../glob.js';
import type { Finding, PreflightRule, RuleContext } from '../types.js';

const ID = 'tdd-pairing';
const SOURCE_GLOBS = ['**/src/**/*.{ts,tsx}'];
const NOT_SOURCE = [
  '**/*.test.{ts,tsx}',
  '**/*.d.ts',
  '**/*.config.{ts,tsx}',
  '**/test-setup.ts',
  '**/fixtures/**',
  '**/__contracts__/**',
  '**/__live__/**',
];
const TEST_GLOBS = ['**/*.test.{ts,tsx}'];
const NO_TEST_WITH_ISSUE = /\[no-test\][^\n]*#\d+|#\d+[^\n]*\[no-test\]/;
// Git drops these lines from the message, so they cannot carry the tag.
const GIT_COMMENT_LINE = /^#(?:\s|$)/;

/** True when a commit message carries [no-test] and an issue link on the same line. */
export function hasNoTestTag(message: string): boolean {
  const kept = message.split('\n').filter((line) => !GIT_COMMENT_LINE.test(line));
  return NO_TEST_WITH_ISSUE.test(kept.join('\n'));
}

type Exemption = (file: string) => boolean;
const PENDING_NOTE =
  '; the commit-msg hook fails this unless the message has [no-test] and an issue link';

/**
 * Files changed only by tagged commits between the merge base and HEAD. A file that an
 * untagged commit or the working tree also changes is not exempt.
 */
async function rangeExemption(ctx: RuleContext, base: string): Promise<Exemption> {
  const tagged = new Set<string>();
  const untagged = new Set(await changedFiles(ctx.exec, ctx.rootDir, 'working-tree'));
  for (const commit of await commitsSince(ctx.exec, ctx.rootDir, base)) {
    const target = hasNoTestTag(commit.message) ? tagged : untagged;
    commit.files.forEach((file) => target.add(file));
  }
  return (file) => tagged.has(file) && !untagged.has(file);
}

/** The message being written exempts the staged change; in a range, each commit counts alone. */
async function exemption(ctx: RuleContext): Promise<Exemption> {
  if (ctx.commitMessage !== undefined) {
    const exempt = hasNoTestTag(ctx.commitMessage);
    return () => exempt;
  }
  return ctx.mergeBase === undefined ? () => false : rangeExemption(ctx, ctx.mergeBase);
}

const BARREL_GLOBS = ['**/index.{ts,tsx}'];
const COMMENTS = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;
const RE_EXPORTS =
  /export\s+(?:type\s+)?(?:\*(?:\s+as\s+\w+)?|\{[^}]*\})\s+from\s+['"][^'"]+['"];?/g;

/** True when the source holds only re-export statements and comments. */
export function isBarrelSource(source: string): boolean {
  return source.replace(COMMENTS, '').replace(RE_EXPORTS, '').trim() === '';
}

/** Changed source files whose package has no changed test file. */
export function unpairedSources(
  changedFiles: readonly string[],
  isBarrel: (file: string) => boolean = () => true,
): string[] {
  const testedPackages = new Set(
    changedFiles.filter((file) => matchesAny(file, TEST_GLOBS)).map(packageOf),
  );
  return changedFiles.filter(
    (file) =>
      matchesAny(file, SOURCE_GLOBS) &&
      !matchesAny(file, NOT_SOURCE) &&
      !(matchesAny(file, BARREL_GLOBS) && isBarrel(file)) &&
      !testedPackages.has(packageOf(file)),
  );
}

export const rule: PreflightRule = {
  id: ID,
  doc: 'AGENTS.md#test-first',
  tier: 'quick',
  severity: 'error',
  summary: 'Each changed source file comes with a changed test in the same package.',
  fixHint:
    'Write the failing test first, or add [no-test] and an issue link to the commit message.',
  async check(ctx) {
    const unpaired = unpairedSources(
      ctx.changedFiles,
      (file) => !fileExists(ctx.rootDir, file) || isBarrelSource(readText(ctx.rootDir, file)),
    );
    const exempt = unpaired.length === 0 ? () => true : await exemption(ctx);
    // Before the message exists (pre-commit), warn; the commit-msg hook makes it an error.
    const pending = ctx.tier === 'quick' && ctx.commitMessage === undefined;
    return unpaired
      .filter((file) => !exempt(file))
      .map((file): Finding => ({
        ruleId: ID,
        file,
        message: `changed without a changed test in ${packageOf(file)}${pending ? PENDING_NOTE : ''}`,
        ...(pending ? { severity: 'warn' as const } : {}),
      }));
  },
};
