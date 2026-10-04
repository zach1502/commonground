import { describe, expect, it } from 'vitest';

import { parcelSchema } from '../schema/parcel.js';

import { parcelGrid } from './parcel-grid.js';

const parcel = parcelSchema.parse({
  id: 'odd',
  name: 'Odd parcel',
  polygon: [
    { x: 2.5, y: -1.2 },
    { x: 30.2, y: -1.2 },
    { x: 30.2, y: 19.9 },
  ],
  origin: { lat: 49.26, lon: -123.1 },
});

describe('parcelGrid', () => {
  it('covers the parcel bounding box in whole cells from a whole-metre corner', () => {
    expect(parcelGrid(parcel)).toEqual({
      width: 29,
      height: 22,
      resolutionM: 1,
      originLocal: { x: 2, y: -2 },
    });
  });

  it('counts cells at a coarser resolution', () => {
    expect(parcelGrid(parcel, 2)).toMatchObject({ width: 15, height: 11, resolutionM: 2 });
  });
});
