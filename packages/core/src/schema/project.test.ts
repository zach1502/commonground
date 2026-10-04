import { describe, expect, it } from 'vitest';

import { closesAtSchema, projectPhase, projectPhaseSchema } from './project.js';

// 31 October 2026 ends at 07:00 UTC on 1 November, since Vancouver is on PDT (UTC-7) until then.
const LAST_EVENING = new Date('2026-11-01T06:59:59.000Z');
const NEXT_MORNING = new Date('2026-11-01T07:00:00.000Z');

describe('closesAtSchema', () => {
  it('takes an ISO calendar date and nothing else', () => {
    expect(closesAtSchema.parse('2026-10-31')).toBe('2026-10-31');
    expect(closesAtSchema.safeParse('2026-10-31T23:59:00Z').success).toBe(false);
    expect(closesAtSchema.safeParse('31 October 2026').success).toBe(false);
    expect(closesAtSchema.safeParse('2026-02-30').success).toBe(false);
  });
});

describe('projectPhase', () => {
  it('is open through the whole last day in Vancouver and closed the day after', () => {
    const project = { status: 'open', closesAt: '2026-10-31' } as const;
    expect(projectPhase(project, LAST_EVENING)).toBe('open');
    expect(projectPhase(project, NEXT_MORNING)).toBe('closed');
  });

  it('is closed whenever staff closed the project, whatever the date', () => {
    expect(projectPhase({ status: 'closed', closesAt: '2026-10-31' }, LAST_EVENING)).toBe('closed');
    expect(projectPhase({ status: 'closed', closesAt: null }, LAST_EVENING)).toBe('closed');
  });

  it('stays open with no closing date until staff close it', () => {
    expect(projectPhase({ status: 'open', closesAt: null }, NEXT_MORNING)).toBe('open');
  });

  it('names only the two phases', () => {
    expect(projectPhaseSchema.options).toEqual(['open', 'closed']);
  });
});
