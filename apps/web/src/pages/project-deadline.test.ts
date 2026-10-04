import { describe, expect, it } from 'vitest';

import { closingDate, deadlineLine, projectMeta } from './project-deadline';

describe('closingDate', () => {
  it('writes the day, month and year in the CONTENT.md order, whatever the time zone', () => {
    expect(closingDate('2026-10-31', 'long')).toBe('31 October 2026');
    expect(closingDate('2026-01-01', 'long')).toBe('1 January 2026');
    expect(closingDate('2026-10-31', 'short')).toBe('31 Oct');
  });
});

describe('deadlineLine', () => {
  it('names the closing day while the project is open', () => {
    expect(deadlineLine({ phase: 'open', closesAt: '2026-10-31' })).toBe(
      'Send your design by 31 October 2026.',
    );
  });

  it('says design is closed once the phase is closed, even with a date', () => {
    expect(deadlineLine({ phase: 'closed', closesAt: '2026-10-31' })).toBe('Design closed.');
    expect(deadlineLine({ phase: 'closed', closesAt: null })).toBe('Design closed.');
  });

  it('says design is open when no closing day is set', () => {
    expect(deadlineLine({ phase: 'open', closesAt: null })).toBe('Design open.');
  });
});

describe('projectMeta', () => {
  it('adds the short closing day to the design count only while open', () => {
    expect(projectMeta({ phase: 'open', closesAt: '2026-10-31' }, 3)).toBe(
      '3 designs, closes 31 Oct',
    );
    expect(projectMeta({ phase: 'open', closesAt: null }, 3)).toBe('3 designs');
    expect(projectMeta({ phase: 'closed', closesAt: '2026-10-31' }, 1)).toBe('1 design');
  });
});
