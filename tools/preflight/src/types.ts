export type Tier = 'quick' | 'standard' | 'full';
export type Severity = 'error' | 'warn' | 'info';

export interface Finding {
  readonly ruleId: string;
  readonly file?: string;
  readonly line?: number;
  readonly message: string;
  readonly severity?: Severity;
}

export interface ExecResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
  /** Set when the binary could not be started, for example because it is not installed. */
  readonly missing?: true;
}

export interface ExecOptions {
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly input?: string;
}

export type Exec = (
  command: string,
  args: readonly string[],
  options?: ExecOptions,
) => Promise<ExecResult>;

export interface RuleContext {
  readonly rootDir: string;
  /**
   * Staged files in the quick tier, files changed since the merge base in the full tier
   * and in CI, and the working tree against HEAD otherwise. Untracked files count.
   */
  readonly changedFiles: readonly string[];
  /** Files a rule scans: the changed files in the quick tier, every repo file otherwise. */
  readonly files: readonly string[];
  readonly stagedOnly: boolean;
  readonly tier: Tier;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly exec: Exec;
  /** The registered rules, for rules that describe other rules (docs-in-sync). */
  readonly rules: readonly PreflightRule[];
  /** The message being committed, set only by --commit-msg in the commit-msg hook. */
  readonly commitMessage?: string;
  /** The file that holds that message, for commitlint. */
  readonly commitMessageFile?: string;
  /** The merge base that changedFiles was diffed against, when there is one. */
  readonly mergeBase?: string;
}

export interface PreflightRule {
  readonly id: string;
  /** Doc anchor such as AGENTS.md#code-limits. */
  readonly doc: string;
  readonly tier: Tier;
  readonly summary: string;
  readonly fixHint: string;
  readonly severity: Severity;
  check(ctx: RuleContext): Promise<Finding[]>;
}

export const TIER_ORDER: readonly Tier[] = ['quick', 'standard', 'full'];

/** True when a rule of tier `ruleTier` runs in a run of tier `runTier`. */
export function tierIncludes(runTier: Tier, ruleTier: Tier): boolean {
  return TIER_ORDER.indexOf(ruleTier) <= TIER_ORDER.indexOf(runTier);
}

/** The severity a finding reports, falling back to its rule's severity. */
export function findingSeverity(finding: Finding, fallback: Severity): Severity {
  return finding.severity ?? fallback;
}
