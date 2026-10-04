import { describe, expect, it } from 'vitest';

import { AGE_BANDS } from '@parkshape/core';

import {
  createBrowserSelfReportStore,
  createMemorySelfReportStore,
  parseFsa,
  validateSelfReport,
} from './self-report';

describe('parseFsa', () => {
  it('accepts a letter, digit, letter and upper-cases it', () => {
    expect(parseFsa(' v5t ')).toEqual({ kind: 'ok', value: 'V5T' });
  });

  it('treats an empty answer as no answer', () => {
    expect(parseFsa('  ')).toEqual({ kind: 'ok', value: null });
  });

  it.each(['V5', 'V5T1', '55T', 'VVT', 'D5T'])('rejects %s', (input) => {
    expect(parseFsa(input)).toEqual({ kind: 'invalid-fsa' });
  });
});

describe('validateSelfReport', () => {
  it('returns the report when both answers are valid', () => {
    expect(validateSelfReport({ fsa: 'v5t', ageBand: '30-44' })).toEqual({
      kind: 'ok',
      report: { fsa: 'V5T', ageBand: '30-44' },
    });
  });

  it('allows either answer to be left out', () => {
    expect(validateSelfReport({ fsa: '', ageBand: null })).toEqual({
      kind: 'ok',
      report: { fsa: null, ageBand: null },
    });
  });

  it('reports a bad postal code', () => {
    expect(validateSelfReport({ fsa: 'xx', ageBand: null })).toEqual({ kind: 'invalid-fsa' });
  });

  it('drops an age band it does not know', () => {
    expect(validateSelfReport({ fsa: '', ageBand: 'ancient' })).toEqual({
      kind: 'ok',
      report: { fsa: null, ageBand: null },
    });
  });

  it('lists the age bands in order', () => {
    expect(AGE_BANDS[0]).toBe('under-18');
    expect(AGE_BANDS.at(-1)).toBe('prefer-not');
  });
});

describe('self-report stores', () => {
  it('memory store remembers answers and skips per user', () => {
    const store = createMemorySelfReportStore();
    expect(store.has('u1')).toBe(false);
    store.save('u1', { kind: 'skipped' });
    expect(store.has('u1')).toBe(true);
    expect(store.has('u2')).toBe(false);
  });

  it('browser store keeps the answer in the given storage', () => {
    const store = createBrowserSelfReportStore(window.localStorage);
    store.save('u3', { kind: 'answered', report: { fsa: 'V5T', ageBand: null } });
    expect(createBrowserSelfReportStore(window.localStorage).has('u3')).toBe(true);
    expect(window.localStorage.getItem('parkshape.self-report.u3')).toContain('V5T');
    window.localStorage.clear();
  });
});
