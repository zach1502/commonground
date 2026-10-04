import { describe, expect, it } from 'vitest';

import type { ToolStep } from './external-tools.js';
import { buildContext, groupFindings, runDoctorOnly, runPreflight } from './runner.js';
import { fakeExec, fixtureDir } from './testing/fixture-context.js';
import type { Exec, PreflightRule, Tier } from './types.js';

function fakeRule(id: string, tier: Tier, outcome: 'pass' | 'fail' | 'crash'): PreflightRule {
  return {
    id,
    doc: 'AGENTS.md#x',
    tier,
    summary: 's',
    fixHint: 'f',
    severity: 'error',
    check: () => {
      if (outcome === 'crash') {
        return Promise.reject(new Error('boom'));
      }
      return Promise.resolve(outcome === 'fail' ? [{ ruleId: id, message: 'broken' }] : []);
    },
  };
}

const NO_TOOLS: readonly ToolStep[] = [];
const BASE = {
  rootDir: fixtureDir('env-documented', 'pass'),
  exec: fakeExec(),
  env: {},
  nodeVersion: 'v20.18.1',
  tools: NO_TOOLS,
};

describe('runPreflight', () => {
  it('runs only rules within the tier', async () => {
    const rules = [fakeRule('quick-ok', 'quick', 'pass'), fakeRule('full-bad', 'full', 'fail')];
    const report = await runPreflight({ ...BASE, tier: 'standard', rules });
    expect(report.groups.map(({ ruleId }) => ruleId)).not.toContain('full-bad');
    const full = await runPreflight({ ...BASE, tier: 'full', rules });
    expect(full.groups.map(({ ruleId }) => ruleId)).toContain('full-bad');
    expect(full.exitCode).toBe(1);
  });

  it('turns a crashing rule into an error finding', async () => {
    const report = await runPreflight({
      ...BASE,
      tier: 'quick',
      rules: [fakeRule('bad', 'quick', 'crash')],
    });
    const group = report.groups.find(({ ruleId }) => ruleId === 'bad');
    expect(group?.findings[0]?.message).toBe('rule crashed: boom');
  });

  it('runs tool steps in the requested tier', async () => {
    const tool: ToolStep = {
      id: 'tool:fake',
      tiers: ['standard'],
      phase: 'lint',
      summary: '',
      fixHint: 'fix',
      doc: 'D.md#x',
      command: () => 'missing',
    };
    const report = await runPreflight({ ...BASE, tier: 'standard', rules: [], tools: [tool] });
    expect(report.groups.find(({ ruleId }) => ruleId === 'tool:fake')?.severity).toBe('info');
  });
});

describe('runPreflight context', () => {
  it('diffs against the merge base in the full tier and carries the commit message', async () => {
    const answers: Record<string, string> = {
      'rev-parse --verify --quiet HEAD': 'h\n',
      'rev-parse --verify --quiet origin/main^{commit}': 'b1\n',
      'merge-base origin/main HEAD': 'b1\n',
      'diff --name-only b1': 'a.ts\n',
    };
    const exec: Exec = (_command, args) => {
      const stdout = answers[args.join(' ')];
      return Promise.resolve({
        code: stdout === undefined ? 1 : 0,
        stdout: stdout ?? '',
        stderr: '',
      });
    };
    const ctx = await buildContext({
      ...BASE,
      exec,
      tier: 'full',
      commitMessage: 'feat: a',
      commitMessageFile: '/m',
    });
    expect(ctx).toEqual(
      expect.objectContaining({
        changedFiles: ['a.ts'],
        mergeBase: 'b1',
        commitMessage: 'feat: a',
        commitMessageFile: '/m',
      }),
    );
  });

  it('can skip doctor', async () => {
    const report = await runPreflight({ ...BASE, tier: 'quick', rules: [], doctor: 'skip' });
    expect(report.groups).toEqual([]);
  });

  it('runs doctor alone', async () => {
    const report = await runDoctorOnly({ ...BASE, tier: 'standard' });
    expect(report.groups.every(({ ruleId }) => ruleId.startsWith('doctor:'))).toBe(true);
  });
});

describe('groupFindings', () => {
  it('uses the worst severity in a group and defaults unknown rules to error', () => {
    const groups = groupFindings(
      [
        { ruleId: 'a', message: 'x', severity: 'info' },
        { ruleId: 'a', message: 'y', severity: 'warn' },
        { ruleId: 'b', message: 'z' },
      ],
      new Map(),
    );
    expect(groups.map(({ ruleId, severity }) => `${ruleId}:${severity}`)).toEqual([
      'a:warn',
      'b:error',
    ]);
  });
});
