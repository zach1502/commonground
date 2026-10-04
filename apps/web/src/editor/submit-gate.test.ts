import { describe, expect, it } from 'vitest';

import { CONSTRAINT_KEYS, type MetricsReport } from '@parkshape/core';

import { submitStep } from './submit-gate';

function reportWith(status: 'ok' | 'fail'): MetricsReport {
  const constraints = Object.fromEntries(
    CONSTRAINT_KEYS.map((key) => [
      key,
      { status: key === 'budget' ? status : 'ok', value: 1, limit: 2, message: key },
    ]),
  );
  return { constraints } as unknown as MetricsReport;
}

describe('submitStep', () => {
  it('opens the submit dialog when nothing blocks the design', () => {
    expect(submitStep(reportWith('ok'))).toBe('dialog');
  });

  it('sends focus to the problem list when a hard rule fails, so Submit stays enabled', () => {
    expect(submitStep(reportWith('fail'))).toBe('problems');
  });

  it('opens the dialog while the meters are still working, and lets the server decide', () => {
    expect(submitStep(null)).toBe('dialog');
  });
});
