import {
  catalogIndex,
  defaultParameters,
  designDocumentSchema,
  makeFlatHeightmap,
  parcelSchema,
  type DesignDocumentInput,
  type Heightmap,
} from '@parkshape/core';

import type { MetricsRequest } from './protocol.js';

const SIDE = 40;
const MARGIN_M = 2;
const SPACING_M = 2;
const PER_ROW = 18;
const GARDEN_EAST_M = 26;
const GARDEN_NORTH_M = 11;

const parcel = parcelSchema.parse({
  id: 'test-parcel',
  name: 'Test parcel',
  polygon: [
    { x: 0, y: 0 },
    { x: SIDE, y: 0 },
    { x: SIDE, y: SIDE },
    { x: 0, y: SIDE },
  ],
  origin: { lat: 49.2636, lon: -123.0995 },
});

const heightmap: Heightmap = makeFlatHeightmap({ width: SIDE, height: SIDE });

function documentOf(items: DesignDocumentInput['items'], areas: DesignDocumentInput['areas'] = []) {
  return designDocumentSchema.parse({
    version: 1,
    items,
    paths: [],
    areas,
    gradeDelta: { cells: [] },
    zones: [],
  });
}

/** A valid metrics request over a flat parcel, with the trees a test asks for. */
export function requestFixture(treeCount = 0): MetricsRequest {
  const items = Array.from({ length: treeCount }, (_, index) => ({
    id: `tree-${String(index)}`,
    catalogId: 'bigleaf-maple',
    position: {
      x: MARGIN_M + (index % PER_ROW) * SPACING_M,
      y: MARGIN_M + Math.floor(index / PER_ROW) * SPACING_M,
    },
    rotationDeg: 0,
    locked: false,
  }));
  return {
    document: documentOf(items),
    parcel,
    parameters: defaultParameters(),
    catalog: catalogIndex,
    heightmap,
  };
}

export const RECORDED_PLOTS = 56;

/** The site's garden as it is today, with the plot count its record gives. */
export function recordedGarden(shiftM = 0): DesignDocumentInput['areas'][number] {
  const west = MARGIN_M + shiftM;
  const east = GARDEN_EAST_M + shiftM;
  return {
    id: 'existing-garden',
    catalogId: 'community-garden',
    polygon: [
      { x: west, y: MARGIN_M },
      { x: east, y: MARGIN_M },
      { x: east, y: GARDEN_NORTH_M },
      { x: west, y: GARDEN_NORTH_M },
    ],
    locked: false,
    existing: true,
    recordedPlots: RECORDED_PLOTS,
  };
}

/** A request for a design that holds one garden, over a baseline that holds the recorded one. */
export function gardenRequestFixture(shiftM: number): MetricsRequest {
  return {
    ...requestFixture(),
    document: documentOf([], [recordedGarden(shiftM)]),
    baseline: documentOf([], [recordedGarden()]),
  };
}
