import { describe, expect, it } from 'vitest';

import { formatReport } from './report.js';
import type { RunReport } from './runner.js';

const REPORT: RunReport = {
  tier: 'standard',
  exitCode: 1,
  changedFiles: [],
  groups: [
    {
      ruleId: 'i',
      severity: 'info',
      doc: '',
      fixHint: '',
      findings: [{ ruleId: 'i', message: 'skipped' }],
    },
    {
      ruleId: 'e',
      severity: 'error',
      doc: 'AGENTS.md#x',
      fixHint: 'Do it.',
      findings: Array.from({ length: 22 }, (_, index) => ({
        ruleId: 'e',
        file: 'a.ts',
        line: index + 1,
        message: 'bad',
      })),
    },
    {
      ruleId: 'w',
      severity: 'warn',
      doc: '',
      fixHint: '',
      findings: [{ ruleId: 'w', file: 'b.md', message: 'hm' }],
    },
  ],
};

describe('formatReport', () => {
  it('lists errors first with files, the fix hint and the doc link', () => {
    const lines = formatReport(REPORT, 'title');
    expect(lines[0]).toBe('title');
    expect(lines[1]).toBe('FAIL e  (AGENTS.md#x)');
    expect(lines[2]).toBe('    a.ts:1: bad');
    expect(lines).toContain('    and 2 more');
    expect(lines).toContain('  Fix: Do it.');
    expect(lines).toContain('WARN w');
    expect(lines).toContain('    b.md: hm');
    expect(lines).toContain('INFO i: skipped');
    expect(lines.at(-1)).toBe('preflight failed: 1 failing, 1 warning, 1 info.');
  });
});
