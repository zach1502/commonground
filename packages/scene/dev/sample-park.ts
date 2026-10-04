import { createSeededRandom, type Heightmap } from '@parkshape/core';

import { FULL_TURN, heightmapFrom, symmetric } from '../src/index.js';
import type { CatalogItem, GroundPoint, ParkDocument, PlacedItem } from '../src/index.js';

const WIDTH = 120;
const DEPTH = 115;
const BASE_ELEVATION_M = 20;
const EAST_RISE = 0.04;
const SOUTH_RISE = 0.02;
const POND = { x: 88, z: 78 };
const POND_DEPTH_M = 1.5;
const POND_SPREAD_M2 = 80;
const TREES_PER_ROW = 10;
const TREE_SPACING_M = 10;
const TREE_JITTER_M = 2;
const TREE_SEED = 4;
// Rows of trees along the north and south edges and a column along the east edge.
const NORTH_ROW = { x: 12, z: 8, stepX: TREE_SPACING_M, stepZ: 0 };
const SOUTH_ROW = { x: 12, z: 106, stepX: TREE_SPACING_M, stepZ: 0 };
const EAST_COLUMN = { x: 110, z: 18, stepX: 0, stepZ: 8 };
// Every third tree is a fir; the rest are maples.
const FIR_EVERY = 3;

/** A ramp that rises to the south-east, with a shallow dip where the pond sits. */
export const rampHeightmap: Heightmap = heightmapFrom(
  { width: WIDTH, height: DEPTH, resolutionM: 1 },
  (x, z) => {
    const dx = x - POND.x;
    const dz = z - POND.z;
    const dip = POND_DEPTH_M * Math.exp(-(dx * dx + dz * dz) / POND_SPREAD_M2);
    return BASE_ELEVATION_M + EAST_RISE * x + SOUTH_RISE * z - dip;
  },
);

/** The ramp's whole grid, as the walk's boundary. */
export const rampParcel: readonly GroundPoint[] = [
  { x: 0, z: 0 },
  { x: WIDTH - 1, z: 0 },
  { x: WIDTH - 1, z: DEPTH - 1 },
  { x: 0, z: DEPTH - 1 },
];

// Model keys match packages/core/src/catalog, so the dev page draws the pipeline's GLBs.
export const sampleCatalog: readonly CatalogItem[] = [
  { id: 'bigleaf-maple', modelKey: 'tree-bigleaf-maple', category: 'tree' },
  { id: 'douglas-fir', modelKey: 'tree-douglas-fir', category: 'tree' },
  { id: 'park-bench', modelKey: 'bench', category: 'bench' },
  { id: 'washroom', modelKey: 'washroom-building', category: 'building' },
];

function treeRows(): PlacedItem[] {
  const random = createSeededRandom(TREE_SEED);
  const rows = [NORTH_ROW, SOUTH_ROW, EAST_COLUMN];
  return rows.flatMap((line, row) =>
    Array.from({ length: TREES_PER_ROW }, (_, k): PlacedItem => {
      const spot = { x: line.x + k * line.stepX, z: line.z + k * line.stepZ };
      return {
        id: `tree-${String(row)}-${String(k)}`,
        catalogId: (row + k) % FIR_EVERY === 0 ? 'douglas-fir' : 'bigleaf-maple',
        position: {
          x: spot.x + symmetric(random.next()) * TREE_JITTER_M,
          z: spot.z + symmetric(random.next()) * TREE_JITTER_M,
        },
        rotationY: random.next() * FULL_TURN,
        scale: 1,
      };
    }),
  );
}

const loop = [
  { x: 20, z: 60 },
  { x: 55, z: 30 },
  { x: 90, z: 40 },
  { x: 95, z: 62 },
  { x: 70, z: 95 },
  { x: 30, z: 90 },
  { x: 20, z: 60 },
];

export const sampleDocument: ParkDocument = {
  items: [
    ...treeRows(),
    {
      id: 'bench-1',
      catalogId: 'park-bench',
      position: { x: 55, z: 34 },
      rotationY: 0.5,
      scale: 1,
    },
    {
      id: 'bench-2',
      catalogId: 'park-bench',
      position: { x: 70, z: 91 },
      rotationY: 2.5,
      scale: 1,
    },
    { id: 'washroom', catalogId: 'washroom', position: { x: 62, z: 60 }, rotationY: 0, scale: 1 },
  ],
  paths: [{ id: 'loop', points: loop, widthM: 2.5 }],
  areas: [
    {
      id: 'garden',
      kind: 'garden',
      outline: [
        { x: 28, z: 64 },
        { x: 48, z: 64 },
        { x: 48, z: 84 },
        { x: 28, z: 84 },
      ],
    },
  ],
  water: [
    {
      id: 'pond',
      outline: [
        { x: 80, z: 71 },
        { x: 96, z: 71 },
        { x: 96, z: 85 },
        { x: 80, z: 85 },
      ],
    },
  ],
};
