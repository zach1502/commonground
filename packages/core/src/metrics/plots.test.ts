import { describe, expect, it } from 'vitest';

import { catalogIndex, modulePlotCount } from '../catalog/catalog.js';
import type { AreaCatalogItem } from '../schema/catalog.js';

import { designOf, rectangle } from './fixtures/design-builders.js';
import { areaPlotCount, plotsRecordedInside } from './plots.js';

const [recorded] = designOf({
  areas: [
    {
      id: 'existing-garden',
      catalogId: 'community-garden',
      polygon: rectangle(2, 2, 26, 11),
      locked: false,
      recordedPlots: 56,
    },
  ],
}).areas;

function gardenEntry(): AreaCatalogItem {
  const entry = catalogIndex.get('community-garden');
  if (entry?.geometryKind !== 'area') throw new Error('community-garden is an area');
  return entry;
}

describe('areaPlotCount', () => {
  if (recorded === undefined) throw new Error('fixture garden');
  const entry = gardenEntry();

  it('uses the recorded count when the polygon matches the baseline area with the same id', () => {
    expect(areaPlotCount(entry, recorded, [recorded])).toBe(56);
  });

  it('fits modules when there is no baseline', () => {
    expect(areaPlotCount(entry, recorded, [])).toBe(modulePlotCount(entry, recorded.polygon));
  });

  it('fits modules when the polygon moved from the baseline', () => {
    const [moved] = designOf({ areas: [{ ...recorded, polygon: rectangle(4, 2, 28, 11) }] }).areas;
    if (moved === undefined) throw new Error('moved garden');
    expect(areaPlotCount(entry, moved, [recorded])).toBe(modulePlotCount(entry, moved.polygon));
  });

  it('ignores a recorded count the baseline does not have', () => {
    const baseline = { ...recorded, recordedPlots: undefined };
    const claimed = { ...recorded, recordedPlots: 500 };
    expect(areaPlotCount(entry, claimed, [baseline])).toBe(
      modulePlotCount(entry, recorded.polygon),
    );
  });

  it('takes the count from the baseline, not from the design', () => {
    expect(areaPlotCount(entry, { ...recorded, recordedPlots: 500 }, [recorded])).toBe(56);
  });
});

describe('plotsRecordedInside', () => {
  const polygon = rectangle(0, 0, 10, 10);

  it('adds the plots of the records inside the polygon', () => {
    const records = [
      { position: { x: 5, y: 5 }, plots: 30 },
      { position: { x: 2, y: 8 }, plots: 26 },
      { position: { x: 20, y: 5 }, plots: 9 },
    ];
    expect(plotsRecordedInside(polygon, records)).toBe(56);
  });

  it('is undefined when no record inside has a plot count', () => {
    expect(plotsRecordedInside(polygon, [{ position: { x: 5, y: 5 } }])).toBeUndefined();
    expect(plotsRecordedInside(polygon, [])).toBeUndefined();
  });
});
