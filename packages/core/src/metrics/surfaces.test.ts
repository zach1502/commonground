import { describe, expect, it } from 'vitest';

import { catalogIndex } from '../catalog/catalog.js';

import {
  designOf,
  rectangle,
  type DesignParts,
  type PathInput,
} from './fixtures/design-builders.js';
import { designFootprints } from './footprints.js';
import { makeFlatHeightmap } from './heightmap.js';
import { gridOf, rasterizePolygon } from './raster.js';
import { measureSurfaces } from './surfaces.js';

const grid = gridOf(makeFlatHeightmap({ width: 20, height: 20 }));
const parcel = rasterizePolygon(grid, rectangle(0, 0, 20, 20));
const measure = (parts: DesignParts) =>
  measureSurfaces(
    designFootprints({ document: designOf(parts), catalog: catalogIndex, grid }),
    parcel,
  );
const area = (id: string, catalogId: string, polygon: ReturnType<typeof rectangle>) => ({
  id,
  catalogId,
  polygon,
  locked: false,
});

describe('measureSurfaces', () => {
  it('counts impervious areas against the parcel', () => {
    expect(measure({ areas: [area('p', 'plaza', rectangle(0, 0, 10, 10))] })).toEqual({
      imperviousPercent: 25,
      waterPercent: 0,
    });
  });

  it('keeps water separate from impervious', () => {
    expect(measure({ areas: [area('w', 'pond', rectangle(0, 0, 10, 10))] })).toEqual({
      imperviousPercent: 0,
      waterPercent: 25,
    });
  });

  it('does not count an asphalt path over a plaza twice', () => {
    const result = measure({
      areas: [area('p', 'plaza', rectangle(0, 0, 10, 10))],
      paths: [
        {
          id: 'a',
          surface: 'asphalt',
          widthM: 2,
          points: [
            { x: 1, y: 5 },
            { x: 9, y: 5 },
          ],
        },
      ],
    });
    expect(result.imperviousPercent).toBe(25);
  });

  it('treats gravel paths as pervious', () => {
    const gravel: PathInput = {
      id: 'g',
      surface: 'gravel',
      widthM: 2,
      points: [
        { x: 1, y: 5 },
        { x: 9, y: 5 },
      ],
    };
    expect(measure({ paths: [gravel] }).imperviousPercent).toBe(0);
  });
});
