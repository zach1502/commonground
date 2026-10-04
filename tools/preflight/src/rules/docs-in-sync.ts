import { renderDocs } from '../docs.js';
import type { Finding, PreflightRule } from '../types.js';

const ID = 'docs-in-sync';

/** 1-based line of the first difference between two texts. */
export function firstDifferentLine(left: string, right: string): number {
  const leftLines = left.split('\n');
  const rightLines = right.split('\n');
  const index = leftLines.findIndex((line, position) => line !== rightLines[position]);
  return (index === -1 ? leftLines.length : index) + 1;
}

export const rule: PreflightRule = {
  id: ID,
  doc: 'AGENTS.md#how-to-work-here',
  tier: 'standard',
  severity: 'error',
  summary: 'The generated rule tables and word list in the docs match the rules and word list.',
  fixHint: 'Run `pnpm preflight --docs` and commit the changed docs.',
  async check(ctx) {
    const docs = await renderDocs(ctx.rootDir, ctx.rules);
    const markers = docs.flatMap(({ file, problems }) =>
      problems.map((problem): Finding => ({ ruleId: ID, file, ...problem })),
    );
    const stale = docs
      .filter(({ current, rendered }) => current !== rendered)
      .map(({ file, current, rendered }): Finding => ({
        ruleId: ID,
        file,
        line: firstDifferentLine(current, rendered),
        message: 'generated block is out of date',
      }));
    return [...markers, ...stale];
  },
};
