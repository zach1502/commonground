import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { TOOL_STEPS } from './external-tools.js';

const WORKFLOW = readFileSync(
  new URL('../../../.github/workflows/ci.yml', import.meta.url),
  'utf8',
);
const JOB_HEADER = /^ {2}([a-z][a-z0-9-]*):$/;

/** Each job under `jobs:` with the text of its block, keyed by job id. */
function jobBlocks(workflow: string): Map<string, string> {
  const jobsAt = workflow.indexOf('\njobs:\n');
  const blocks = new Map<string, string>();
  let current: string | undefined;
  for (const line of workflow.slice(jobsAt).split('\n').slice(1)) {
    const header = JOB_HEADER.exec(line);
    if (header?.[1] !== undefined) {
      current = header[1];
      blocks.set(current, '');
    } else if (current !== undefined) {
      blocks.set(current, `${blocks.get(current) ?? ''}${line}\n`);
    }
  }
  return blocks;
}

describe('the CI workflow', () => {
  it('runs the full preflight tier in the preflight job, and no tier runs the browser tests', () => {
    const fullTierJobs = [...jobBlocks(WORKFLOW)].filter(([, block]) =>
      block.includes('pnpm preflight --full'),
    );
    expect(fullTierJobs.map(([id]) => id)).toEqual(['preflight']);
    expect(TOOL_STEPS.some(({ id }) => id.includes('playwright'))).toBe(false);
    expect(WORKFLOW).not.toContain('playwright');
  });

  it('runs lint, typecheck, the tests with coverage and the build in their own jobs', () => {
    const jobs = jobBlocks(WORKFLOW);
    expect(jobs.get('lint')).toContain('pnpm lint');
    expect(jobs.get('typecheck')).toContain('pnpm typecheck');
    expect(jobs.get('test')).toContain('pnpm test:coverage');
    expect(jobs.get('build')).toContain('pnpm build');
  });
});
