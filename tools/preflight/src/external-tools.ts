import { resolveBin } from './bin.js';
import { isTruthyFlag } from './ci.js';
import { matchesAny } from './glob.js';
import { NESTED_ENV } from './nested-guard.js';
import type { ExecResult, Finding, RuleContext, Tier } from './types.js';

const OUTPUT_TAIL_LINES = 25;
const MISSING_LOCALLY = 'not installed; skipped';
const MISSING_IN_CI = 'not installed; CI needs it';
// REMINDERS lines for skipped tools whose gap is worth naming; others get a generic line.
const MISSING_NOTICES: Readonly<Record<string, string>> = {
  'tool:gitleaks': 'gitleaks is not installed; secret scan skipped',
};
const ESCAPE_CHAR_CODE = 27;
const ANSI = new RegExp(`${String.fromCharCode(ESCAPE_CHAR_CODE)}\\[[0-9;]*[A-Za-z]`, 'g');

export type Phase = 'types' | 'lint';

export interface ToolStep {
  readonly id: string;
  readonly tiers: readonly Tier[];
  readonly phase: Phase;
  readonly summary: string;
  readonly fixHint: string;
  readonly doc: string;
  /** Returns the command to run, or undefined when there is nothing to check. */
  command(ctx: RuleContext): ToolCommand | 'missing' | undefined;
}

export interface ToolCommand {
  readonly bin: string;
  readonly args: string[];
  /** Extra environment for this tool only. */
  readonly env?: Readonly<Record<string, string>>;
}

// Typed linting of every package holds about 4.6 GB, over Node's default heap on a 16 GB laptop.
const ESLINT_ENV = { NODE_OPTIONS: '--max-old-space-size=6144' } as const;

// Caches live under node_modules/.cache, which git ignores and a fresh CI checkout does not have.
const PRETTIER_CACHE = [
  '--cache',
  '--cache-location',
  'node_modules/.cache/prettier/.prettier-cache',
];
const STYLELINT_CACHE = ['--cache', '--cache-location', 'node_modules/.cache/stylelint/'];
const ESLINT_CACHE = [
  '--cache',
  '--cache-strategy',
  'content',
  '--cache-location',
  'node_modules/.cache/eslint/',
];

/**
 * A cached ESLint result for an unchanged file can miss a typed-rule error caused by a change to
 * another file's types, so the full tier, which the pre-push hook and CI run, lints afresh.
 */
function eslintCache(tier: Tier): readonly string[] {
  return tier === 'full' ? [] : ESLINT_CACHE;
}

const ALL_TIERS: readonly Tier[] = ['quick', 'standard', 'full'];
const REPO_TIERS: readonly Tier[] = ['standard', 'full'];
const TOOLS_DOC = 'CONTRIBUTING.md#preflight-tiers';

function local(
  ctx: RuleContext,
  name: string,
  args: string[],
): { bin: string; args: string[] } | 'missing' {
  const bin = resolveBin(ctx.rootDir, name);
  return bin === undefined ? 'missing' : { bin, args };
}

/** In the quick tier, the changed files that match; otherwise the repo-wide arguments. */
function targets(
  ctx: RuleContext,
  globs: readonly string[],
  repoArgs: string[],
): string[] | undefined {
  if (ctx.tier !== 'quick') {
    return repoArgs;
  }
  const files = ctx.files.filter((file) => matchesAny(file, globs));
  return files.length > 0 ? files : undefined;
}

function fileTool(spec: {
  id: string;
  bin: string;
  globs: readonly string[];
  fixedArgs: string[];
  repoArgs: string[];
  fixHint: string;
  env?: Readonly<Record<string, string>>;
  cacheArgs?: (tier: Tier) => readonly string[];
}): ToolStep {
  return {
    id: `tool:${spec.id}`,
    tiers: ALL_TIERS,
    phase: 'lint',
    summary: `${spec.bin} over the changed files, or the whole repo above the quick tier.`,
    fixHint: spec.fixHint,
    doc: TOOLS_DOC,
    command(ctx) {
      const files = targets(ctx, spec.globs, spec.repoArgs);
      if (files === undefined) return undefined;
      const cache = spec.cacheArgs?.(ctx.tier) ?? [];
      const command = local(ctx, spec.bin, [...spec.fixedArgs, ...cache, ...files]);
      return command === 'missing' || spec.env === undefined
        ? command
        : { ...command, env: spec.env };
    },
  };
}

function repoTool(spec: {
  id: string;
  bin: string;
  args: string[];
  phase?: Phase;
  fixHint: string;
}): ToolStep {
  return {
    id: `tool:${spec.id}`,
    tiers: REPO_TIERS,
    phase: spec.phase ?? 'lint',
    summary: `${spec.bin} ${spec.args.join(' ')}`,
    fixHint: spec.fixHint,
    doc: TOOLS_DOC,
    command(ctx) {
      return local(ctx, spec.bin, spec.args);
    },
  };
}

export const TOOL_STEPS: readonly ToolStep[] = [
  repoTool({
    id: 'tsc',
    bin: 'tsc',
    args: ['-b'],
    phase: 'types',
    fixHint: 'Fix the type errors tsc reports.',
  }),
  fileTool({
    id: 'prettier',
    bin: 'prettier',
    globs: ['**/*.{ts,tsx,js,mjs,cjs,json,md,css,yml,yaml}'],
    fixedArgs: ['--check', '--ignore-unknown'],
    cacheArgs: () => PRETTIER_CACHE,
    repoArgs: ['.'],
    fixHint: 'Run pnpm exec prettier --write on the files listed.',
  }),
  fileTool({
    id: 'eslint',
    bin: 'eslint',
    globs: ['**/*.{ts,tsx,js,mjs,cjs}'],
    fixedArgs: ['--max-warnings', '0', '--no-warn-ignored'],
    cacheArgs: eslintCache,
    repoArgs: ['.'],
    env: ESLINT_ENV,
    fixHint: 'Fix the code. Disable comments need a reason and an issue link.',
  }),
  fileTool({
    id: 'stylelint',
    bin: 'stylelint',
    globs: ['**/*.css'],
    fixedArgs: ['--allow-empty-input'],
    cacheArgs: () => STYLELINT_CACHE,
    repoArgs: ['**/*.css'],
    fixHint: 'Use design tokens through var().',
  }),
  fileTool({
    id: 'textlint',
    bin: 'textlint',
    globs: ['**/*.md'],
    fixedArgs: [],
    repoArgs: ['**/*.md', 'packages/db/seed/**/*.{md,txt}'],
    fixHint: 'Rewrite the prose as CONTENT.md says.',
  }),
  {
    id: 'tool:commitlint',
    tiers: ALL_TIERS,
    phase: 'lint',
    summary: 'commitlint on the message being written, or on each commit since the merge base.',
    fixHint: 'Rewrite the commit message as a Conventional Commit under 72 characters.',
    doc: TOOLS_DOC,
    command(ctx) {
      // Never a leftover .git/COMMIT_EDITMSG: that holds the previous commit's message.
      if (ctx.commitMessageFile !== undefined) {
        return local(ctx, 'commitlint', ['--edit', ctx.commitMessageFile]);
      }
      return ctx.tier === 'full' && ctx.mergeBase !== undefined
        ? local(ctx, 'commitlint', ['--from', ctx.mergeBase, '--to', 'HEAD'])
        : undefined;
    },
  },
  {
    id: 'tool:gitleaks',
    tiers: ALL_TIERS,
    phase: 'lint',
    summary: 'gitleaks on the staged change, or the git history above the quick tier.',
    fixHint: 'Remove the secret, rotate it, and keep secrets in env or a vault.',
    doc: TOOLS_DOC,
    command(ctx) {
      const scope =
        ctx.tier === 'quick' ? ['protect', '--staged', '--no-banner'] : ['detect', '--no-banner'];
      // --verbose names each finding's file and line; --redact keeps the secret out of the log.
      return { bin: 'gitleaks', args: [...scope, '--redact', '--verbose'] };
    },
  },
  repoTool({
    id: 'knip',
    bin: 'knip',
    args: [],
    fixHint: 'Delete the unused file, export or dependency.',
  }),
  repoTool({
    id: 'depcruise',
    bin: 'depcruise',
    args: ['apps', 'packages', 'tools'],
    fixHint: 'Follow the dependency direction in AGENTS.md. Ask before adding an edge.',
  }),
  repoTool({
    id: 'jscpd',
    bin: 'jscpd',
    args: ['.'],
    fixHint: 'Extract the repeated code into one place.',
  }),
];

/** The last lines of a tool's output, without colour codes. */
export function outputTail(result: ExecResult): string {
  const lines = `${result.stdout}\n${result.stderr}`.replace(ANSI, '').trim().split('\n');
  return lines.slice(-OUTPUT_TAIL_LINES).join('\n');
}

function missingFinding(step: ToolStep, ctx: RuleContext): Finding {
  return isTruthyFlag(ctx.env.CI)
    ? { ruleId: step.id, severity: 'error', message: MISSING_IN_CI }
    : { ruleId: step.id, severity: 'info', message: MISSING_LOCALLY };
}

/** REMINDERS lines for tools that were skipped because they are not installed. */
export function missingToolNotices(findings: readonly Finding[]): string[] {
  return findings
    .filter(({ ruleId, message }) => ruleId.startsWith('tool:') && message === MISSING_LOCALLY)
    .map(
      ({ ruleId }) =>
        MISSING_NOTICES[ruleId] ??
        `${ruleId.slice('tool:'.length)} is not installed; its check was skipped`,
    );
}

export async function runStep(step: ToolStep, ctx: RuleContext): Promise<Finding[]> {
  const command = step.command(ctx);
  if (command === undefined) {
    return [];
  }
  if (command === 'missing') {
    return [missingFinding(step, ctx)];
  }
  // The PID lets a nested preflight check that this run really is its ancestor.
  const env = {
    ...ctx.env,
    ...command.env,
    [NESTED_ENV]: String(process.pid),
    FORCE_COLOR: '0',
    NO_COLOR: '1',
  };
  const result = await ctx.exec(command.bin, command.args, { cwd: ctx.rootDir, env });
  if (result.missing === true) {
    return [missingFinding(step, ctx)];
  }
  return result.code === 0 ? [] : [{ ruleId: step.id, message: outputTail(result) }];
}
