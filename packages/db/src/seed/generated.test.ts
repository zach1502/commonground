import { describe, expect, it } from 'vitest';

import { submittableReport } from './generated.js';
import { loadJonathanRogersSite } from './jonathan-rogers.js';

describe('submittableReport', () => {
  const site = loadJonathanRogersSite();

  it('counts the recorded 56 plots for the garden kept as it is today, as blurbs quote', () => {
    expect(submittableReport(site, site.baseline)?.totals.gardenPlots).toBe(56);
  });
});
