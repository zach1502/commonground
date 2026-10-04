import { runDoctor, DOCTOR_CHECKS } from './doctor.js';
import { runStep, TOOL_STEPS, type ToolStep } from './external-tools.js';
import { fileExists, listRepoFiles } from './files.js';
import { changedFilesForTier } from './git.js';
import { registry } from './registry.js';
import {
  findingSeverity,
  tierIncludes,
  type Exec,
  type Finding,
  type PreflightRule,
  type RuleContext,
  type Severity,
  type Tier,
} from './types.js';

export interface RunOptions {
  readonly rootDir: string;
  readonly tier: Tier;
  readonly exec: Exec;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly nodeVersion: string;
  readonly rules?: readonly PreflightRule[];
  readonly tools?: readonly ToolStep[];
  /** The message being committed and its file, from --commit-msg. */
  readonly commitMessage?: string;
  readonly commitMessageFile?: string;
  /** The commit-msg hook skips doctor; the pre-commit hook has just run it. */
  readonly doctor?: 'run' | 'skip';
}

export interface RuleGroup {
  readonly ruleId: string;
  readonly severity: Severity;
  readonly doc: string;
  readonly fixHint: string;
  readonly findings: readonly Finding[];
}

export interface RunReport {
  readonly tier: Tier;
  readonly exitCode: number;
  readonly changedFiles: readonly string[];
  readonly groups: readonly RuleGroup[];
}

interface CheckMeta {
  readonly severity: Severity;
  readonly doc: string;
  readonly fixHint: string;
}

const SEVERITY_ORDER: readonly Severity[] = ['error', 'warn', 'info'];
const DOCTOR_DOC = 'CONTRIBUTING.md#setup';

export async function buildContext(options: RunOptions): Promise<RuleContext> {
  const stagedOnly = options.tier === 'quick';
  const change = await changedFilesForTier(options.exec, options.rootDir, options);
  const files = stagedOnly
    ? change.files.filter((file) => fileExists(options.rootDir, file))
    : listRepoFiles(options.rootDir);
  return {
    rootDir: options.rootDir,
    changedFiles: change.files,
    files,
    stagedOnly,
    tier: options.tier,
    env: options.env,
    exec: options.exec,
    rules: options.rules ?? registry,
    ...(change.base === undefined ? {} : { mergeBase: change.base }),
    ...(options.commitMessage === undefined ? {} : { commitMessage: options.commitMessage }),
    ...(options.commitMessageFile === undefined
      ? {}
      : { commitMessageFile: options.commitMessageFile }),
  };
}

async function safeCheck(rule: PreflightRule, ctx: RuleContext): Promise<Finding[]> {
  try {
    return await rule.check(ctx);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return [{ ruleId: rule.id, severity: 'error', message: `rule crashed: ${reason}` }];
  }
}

async function runTools(tools: readonly ToolStep[], ctx: RuleContext): Promise<Finding[]> {
  const inTier = tools.filter((step) => step.tiers.includes(ctx.tier));
  const findings: Finding[] = [];
  for (const step of inTier.filter(({ phase }) => phase === 'types')) {
    findings.push(...(await runStep(step, ctx)));
  }
  const lint = inTier.filter(({ phase }) => phase === 'lint');
  findings.push(...(await Promise.all(lint.map((step) => runStep(step, ctx)))).flat());
  return findings;
}

function metaIndex(
  rules: readonly PreflightRule[],
  tools: readonly ToolStep[],
): Map<string, CheckMeta> {
  const index = new Map<string, CheckMeta>();
  for (const check of DOCTOR_CHECKS) {
    index.set(check.id, { severity: 'error', doc: DOCTOR_DOC, fixHint: check.fixHint });
  }
  for (const step of tools) {
    index.set(step.id, { severity: 'error', doc: step.doc, fixHint: step.fixHint });
  }
  for (const rule of rules) {
    index.set(rule.id, rule);
  }
  return index;
}

/** Groups findings by rule; a group's severity is the worst severity among its findings. */
export function groupFindings(
  findings: readonly Finding[],
  index: ReadonlyMap<string, CheckMeta>,
): RuleGroup[] {
  const groups = new Map<string, Finding[]>();
  for (const finding of findings) {
    groups.set(finding.ruleId, [...(groups.get(finding.ruleId) ?? []), finding]);
  }
  return [...groups.entries()].map(([ruleId, members]) => {
    const meta = index.get(ruleId) ?? { severity: 'error', doc: '', fixHint: '' };
    const severities = members.map((finding) => findingSeverity(finding, meta.severity));
    const severity = SEVERITY_ORDER.find((level) => severities.includes(level)) ?? 'info';
    return { ruleId, severity, doc: meta.doc, fixHint: meta.fixHint, findings: members };
  });
}

/** Runs doctor, then the external tools for the tier, then the rules within the tier. */
export async function runPreflight(options: RunOptions): Promise<RunReport> {
  const ctx = await buildContext(options);
  const tools = options.tools ?? TOOL_STEPS;
  const doctor = options.doctor === 'skip' ? [] : await runDoctor(options);
  const toolFindings = await runTools(tools, ctx);
  const rules = ctx.rules.filter((rule) => tierIncludes(options.tier, rule.tier));
  const ruleFindings = (await Promise.all(rules.map((rule) => safeCheck(rule, ctx)))).flat();
  const groups = groupFindings(
    [...doctor, ...toolFindings, ...ruleFindings],
    metaIndex(ctx.rules, tools),
  );
  const exitCode = groups.some(({ severity }) => severity === 'error') ? 1 : 0;
  return { tier: options.tier, exitCode, changedFiles: ctx.changedFiles, groups };
}

/** Runs doctor alone, as `pnpm doctor` does. */
export async function runDoctorOnly(options: RunOptions): Promise<RunReport> {
  const findings = await runDoctor(options);
  const groups = groupFindings(findings, metaIndex([], []));
  const exitCode = groups.some(({ severity }) => severity === 'error') ? 1 : 0;
  return { tier: options.tier, exitCode, changedFiles: [], groups };
}
