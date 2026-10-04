import { describe, expect, it } from 'vitest';

import { localPointSchema, polygonSchema } from '@parkshape/core';

import { withRecordedGardenPlots } from './garden-plots.js';
import type { ProposedFeature } from './ports/site-features-provider.js';

const outline = polygonSchema.parse([
  { x: 0, y: 0 },
  { x: 40, y: 0 },
  { x: 40, y: 20 },
  { x: 0, y: 20 },
]);

const provenance = { source: 'Test', datasetId: 'test' };

const record: ProposedFeature = {
  kind: 'garden',
  position: localPointSchema.parse({ x: 20, y: 10 }),
  attributes: { name: 'Community garden', plots: 56 },
  suggestedLocked: true,
  provenance,
};

const gardenOutline: ProposedFeature = {
  kind: 'garden',
  polygon: outline,
  attributes: { name: 'Community garden' },
  suggestedLocked: false,
  provenance,
};

describe('withRecordedGardenPlots', () => {
  it('copies the plots of the garden record inside a garden outline onto the outline', () => {
    const [, mapped] = withRecordedGardenPlots([record, gardenOutline]);
    expect(mapped?.attributes.plots).toBe(56);
    expect(mapped?.attributes.name).toBe('Community garden');
  });

  it('leaves the record itself, other kinds and records outside the outline alone', () => {
    const field: ProposedFeature = { ...gardenOutline, kind: 'sportsField' };
    const away: ProposedFeature = { ...record, position: localPointSchema.parse({ x: 60, y: 10 }) };
    expect(withRecordedGardenPlots([record, field])).toEqual([record, field]);
    expect(withRecordedGardenPlots([away, gardenOutline])).toEqual([away, gardenOutline]);
  });

  it('keeps a plot count the outline already has', () => {
    const counted: ProposedFeature = { ...gardenOutline, attributes: { plots: 12 } };
    expect(withRecordedGardenPlots([record, counted])[1]?.attributes.plots).toBe(12);
  });
});
