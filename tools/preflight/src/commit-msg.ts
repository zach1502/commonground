import { readFileSync } from 'node:fs';
import path from 'node:path';

import { TOOL_STEPS } from './external-tools.js';
import { registry } from './registry.js';
import { runPreflight, type RunOptions, type RunReport } from './runner.js';

export const COMMIT_MSG_TITLE = 'preflight commit-msg: tdd-pairing and commitlint';
const COMMIT_MSG_RULES = new Set(['tdd-pairing']);
const COMMIT_MSG_TOOLS = new Set(['tool:commitlint']);

export type CommitMsgOutcome =
  | { readonly kind: 'report'; readonly report: RunReport }
  | { readonly kind: 'unreadable'; readonly file: string; readonly reason: string };

/**
 * The commit-msg hook: commitlint on the message file, and tdd-pairing on the staged files
 * with that message as the only source of a [no-test] exemption.
 */
export async function runCommitMsg(
  messagePath: string,
  options: Omit<RunOptions, 'tier'>,
): Promise<CommitMsgOutcome> {
  const file = path.resolve(options.rootDir, messagePath);
  let message: string;
  try {
    message = readFileSync(file, 'utf8');
  } catch (error) {
    return { kind: 'unreadable', file, reason: error instanceof Error ? error.message : '' };
  }
  const report = await runPreflight({
    ...options,
    tier: 'quick',
    doctor: 'skip',
    rules: registry.filter(({ id }) => COMMIT_MSG_RULES.has(id)),
    tools: TOOL_STEPS.filter(({ id }) => COMMIT_MSG_TOOLS.has(id)),
    commitMessage: message,
    commitMessageFile: file,
  });
  return { kind: 'report', report };
}
