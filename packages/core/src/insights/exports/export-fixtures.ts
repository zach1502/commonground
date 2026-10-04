import { catalogIndex } from '../../catalog/catalog.js';
import { itemAt, rectangle, rectangleParcel } from '../../metrics/fixtures/design-builders.js';
import { syntheticDesign } from '../fixtures.js';

import type { ExportInput } from './top-designs.js';

const PARCEL_WIDTH_M = 40;
const PARCEL_DEPTH_M = 30;
const TREE_AT_M = 5;
const BENCH_AT_M = 8;
const PATH_WIDTH_M = 2;
const PATH_SOUTH_M = 1;
const PATH_EAST_M = 20;
const PATH_NORTH_M = 10;
const GARDEN_WEST_M = 10;
const GARDEN_EAST_M = 22;
const GARDEN_NORTH_M = 26;
const FIRST = { up: 5, down: 1, score: 0.75, netM3: -12.5 } as const;
const SECOND_SCORE = 0.5;
const SECOND_RANK = 2;

/** Two ranked designs with a tree, a bench, a path and a garden between them. */
export const EXPORT_INPUT: ExportInput = {
  parcel: rectangleParcel(PARCEL_WIDTH_M, PARCEL_DEPTH_M),
  catalog: catalogIndex,
  designs: [
    {
      rank: 1,
      score: FIRST.score,
      design: {
        ...syntheticDesign({
          id: 'd1',
          up: FIRST.up,
          down: FIRST.down,
          metrics: { netM3: FIRST.netM3, constraints: {} },
          parts: {
            items: [
              itemAt('t1', 'garry-oak', TREE_AT_M, TREE_AT_M),
              itemAt('b1', 'bench', BENCH_AT_M, BENCH_AT_M),
            ],
            paths: [
              {
                id: 'p1',
                surface: 'gravel',
                widthM: PATH_WIDTH_M,
                points: [
                  { x: 0, y: PATH_SOUTH_M },
                  { x: PATH_EAST_M, y: PATH_SOUTH_M },
                  { x: PATH_EAST_M, y: PATH_NORTH_M },
                ],
              },
            ],
          },
        }),
        title: 'Shade, "quiet" corner',
      },
    },
    {
      rank: SECOND_RANK,
      score: SECOND_SCORE,
      design: syntheticDesign({
        id: 'd2',
        parts: {
          areas: [
            {
              id: 'g1',
              catalogId: 'community-garden',
              polygon: rectangle(GARDEN_WEST_M, GARDEN_WEST_M, GARDEN_EAST_M, GARDEN_NORTH_M),
              locked: false,
            },
          ],
        },
      }),
    },
  ],
};
