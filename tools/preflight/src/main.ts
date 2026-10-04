import { parseArgs } from 'node:util';

import { isTruthyFlag } from './ci.js';
import { COMMIT_MSG_TITLE, runCommitMsg } from './commit-msg.js';
import { contextSections, formatContext } from './context.js';
import { writeDocs } from './docs.js';
import { explainRule, unknownRule } from './explain.js';
import { missingToolNotices } from './external-tools.js';
import { changedFilesForTier } from './git.js';
import { NESTED_ENV, nestedVerdict } from './nested-guard.js';
import { findRule, registry } from './registry.js';
import { buildReminders } from './reminders.js';
import { formatReport } from './report.js';
import { runDoctorOnly, runPreflight, type RunReport } from './runner.js';
import type { Exec, Tier } from './types.js';

export const EXIT_OK = 0;
export const EXIT_FAILED = 1;
export const EXIT_USAGE = 2;
const JSON_INDENT = 2;
export const NESTED_MESSAGE = 'preflight: nested run skipped';
export const SKIP_REFUSED_MESSAGE = 'skip refused in CI';

export interface MainIo {
  readonly rootDir: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly exec: Exec;
  /** The parent PID, for the nested-run guard. */
  readonly ppid: number;
  readonly write: (line: string) => void;
  readonly nodeVersion: string;
  readonly nowMs: number;
}

const OPTIONS = {
  quick: { type: 'boolean' },
  standard: { type: 'boolean' },
  full: { type: 'boolean' },
  docs: { type: 'boolean' },
  context: { type: 'string' },
  explain: { type: 'string' },
  doctor: { type: 'boolean' },
  'skip-preflight': { type: 'boolean' },
  'commit-msg': { type: 'string' },
  json: { type: 'boolean' },
} as const;

type Flags = ReturnType<typeof parseFlags>;

function parseFlags(argv: readonly string[]) {
  return parseArgs({ args: [...argv], options: OPTIONS, strict: true, allowPositionals: false })
    .values;
}

/** The highest tier named on the command line; standard when none is. */
export function pickTier(flags: Pick<Flags, 'quick' | 'standard' | 'full'>): Tier {
  if (flags.full === true) {
    return 'full';
  }
  return flags.quick === true && flags.standard !== true ? 'quick' : 'standard';
}

async function writeReminders(
  io: MainIo,
  tier: Tier | undefined,
  json: RunReport | undefined,
  report: RunReport | undefined = json,
): Promise<void> {
  const change = await changedFilesForTier(io.exec, io.rootDir, {
    tier: tier ?? 'standard',
    env: io.env,
  });
  const reminders = buildReminders({
    rootDir: io.rootDir,
    changedFiles: change.files,
    nowMs: io.nowMs,
    notices: missingToolNotices(report?.groups.flatMap(({ findings }) => findings) ?? []),
    ...(tier === undefined ? {} : { tier }),
  });
  if (json !== undefined) {
    io.write(JSON.stringify({ ...json, reminders }, null, JSON_INDENT));
    return;
  }
  io.write('');
  reminders.forEach((line) => {
    io.write(line);
  });
}

async function runInfoMode(flags: Flags, io: MainIo): Promise<number | undefined> {
  if (flags.explain !== undefined) {
    const rule = findRule(flags.explain);
    (rule === undefined
      ? unknownRule(flags.explain, registry)
      : explainRule(io.rootDir, rule)
    ).forEach(io.write);
    return rule === undefined ? EXIT_USAGE : EXIT_OK;
  }
  if (flags.context !== undefined) {
    formatContext(flags.context, contextSections(io.rootDir, flags.context)).forEach(io.write);
    return EXIT_OK;
  }
  if (flags.docs === true) {
    const changed = await writeDocs(io.rootDir, registry);
    io.write(
      changed.length === 0
        ? 'preflight --docs: docs already up to date.'
        : `preflight --docs: updated ${changed.join(', ')}.`,
    );
    return EXIT_OK;
  }
  return undefined;
}

function checkOptions(io: MainIo) {
  return { rootDir: io.rootDir, exec: io.exec, env: io.env, nodeVersion: io.nodeVersion };
}

async function runCheckMode(flags: Flags, io: MainIo): Promise<number> {
  const tier = pickTier(flags);
  const options = { ...checkOptions(io), tier };
  const doctorOnly = flags.doctor === true;
  const report = doctorOnly ? await runDoctorOnly(options) : await runPreflight(options);
  if (flags.json === true) {
    await writeReminders(io, doctorOnly ? undefined : tier, report);
    return report.exitCode;
  }
  const title = doctorOnly
    ? 'preflight doctor'
    : `preflight ${tier}: ${String(registry.length)} rules`;
  formatReport(report, title).forEach(io.write);
  await writeReminders(io, doctorOnly ? undefined : tier, undefined, report);
  return report.exitCode;
}

async function runCommitMsgMode(messagePath: string, io: MainIo): Promise<number> {
  const outcome = await runCommitMsg(messagePath, checkOptions(io));
  if (outcome.kind === 'unreadable') {
    io.write(`preflight: cannot read the commit message at ${outcome.file}: ${outcome.reason}`);
    return EXIT_USAGE;
  }
  formatReport(outcome.report, COMMIT_MSG_TITLE).forEach(io.write);
  await writeReminders(io, 'quick', undefined, outcome.report);
  return outcome.report.exitCode;
}

/** A skip is a warning locally and an error in CI, whichever way it was asked for. */
function skipped(io: MainIo, localMessage: string): number {
  const refused = isTruthyFlag(io.env.CI);
  io.write(refused ? SKIP_REFUSED_MESSAGE : localMessage);
  return refused ? EXIT_USAGE : EXIT_OK;
}

/** Entry point behind `pnpm preflight` and `pnpm doctor`; returns the exit code. */
export async function main(argv: readonly string[], io: MainIo): Promise<number> {
  const nested = await nestedVerdict(io.env, io.ppid, io.exec);
  if (nested === 'nested') {
    io.write(NESTED_MESSAGE);
    return EXIT_OK;
  }
  if (nested === 'spoofed') {
    return skipped(
      io,
      `preflight: skipped because ${NESTED_ENV} is set but names no parent preflight. Run it before you push.`,
    );
  }
  let flags: Flags;
  try {
    flags = parseFlags(argv);
  } catch (error) {
    io.write(`preflight: ${error instanceof Error ? error.message : String(error)}`);
    return EXIT_USAGE;
  }
  if (flags['skip-preflight'] === true) {
    return skipped(io, 'preflight: skipped with --skip-preflight. Run it before you push.');
  }
  if (flags['commit-msg'] !== undefined) {
    return runCommitMsgMode(flags['commit-msg'], io);
  }
  const infoExit = await runInfoMode(flags, io);
  if (infoExit !== undefined) {
    await writeReminders(io, undefined, undefined);
    return infoExit;
  }
  return runCheckMode(flags, io);
}
