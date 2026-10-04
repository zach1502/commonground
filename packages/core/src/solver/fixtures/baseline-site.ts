import { createSeededRandom } from '../../adapters/seeded-random.js';
import { catalogIndex } from '../../catalog/catalog.js';
import {
  designOf,
  itemAt,
  parametersWith,
  rectangle,
  rectangleParcel,
} from '../../metrics/fixtures/design-builders.js';
import { makeRampHeightmap } from '../../metrics/heightmap.js';
import type { DesignDocument } from '../../schema/design.js';
import { intentSchema, type Intent } from '../intent.js';
import type { SolveInput } from '../solve.js';

export const SITE_WIDTH_M = 120;
export const SITE_DEPTH_M = 60;
export const GARDEN_ID = 'old-garden';
export const LAWN_ID = 'old-lawn';
export const CHERRY_IDS = ['cherry-1', 'cherry-2', 'cherry-3'] as const;
const CHERRY_ROW = { startX: 50, stepM: 10, y: 8 };
const CEDAR = { position: { x: 40, y: 45 }, dbhCm: 30 };
const GARDEN_BOX = { x0: 95, y0: 38, x1: 115, y1: 56 };
const LAWN_BOX = { x0: 2, y0: 2, x1: 30, y1: 30 };
const PATH_FROM = { x: 5, y: 50 };
const PATH_TO = { x: 30, y: 50 };
const LAYOUT_SEED = 7;
const RAMP_GRADE = 0.01;

function box(corners: { x0: number; y0: number; x1: number; y1: number }) {
  return rectangle(corners.x0, corners.y0, corners.x1, corners.y1);
}

/**
 * A park as it is today: an unlocked garden in the north-east, an unlocked lawn in the
 * south-west, three unlocked cherries, one locked cedar and one gravel path. The garden, lawn
 * and path are marked existing.
 */
export const BASELINE: DesignDocument = designOf({
  items: [
    ...CHERRY_IDS.map((id, index) => ({
      ...itemAt(id, 'flowering-cherry', 0, 0),
      position: { x: CHERRY_ROW.startX + index * CHERRY_ROW.stepM, y: CHERRY_ROW.y },
    })),
    {
      ...itemAt('old-cedar', 'western-red-cedar', 0, 0),
      ...CEDAR,
      locked: true,
    },
  ],
  areas: [
    {
      id: GARDEN_ID,
      catalogId: 'community-garden',
      polygon: box(GARDEN_BOX),
      locked: false,
      existing: true,
    },
    {
      id: LAWN_ID,
      catalogId: 'lawn',
      polygon: box(LAWN_BOX),
      locked: false,
      existing: true,
    },
  ],
  paths: [
    {
      id: 'old-path',
      surface: 'gravel',
      widthM: 2,
      points: [PATH_FROM, PATH_TO],
      existing: true,
    },
  ],
});

/** Paths, canopy and character only: nothing that names an existing feature. */
export function neutralIntent(patch: Partial<Intent> = {}): Intent {
  return intentSchema.parse({
    features: [],
    paths: { style: 'loop' },
    canopy: 'keep-existing',
    character: 'open-lawn',
    ...patch,
  });
}

export function baselineInput(intent: Intent, patch: Partial<SolveInput> = {}): SolveInput {
  return {
    intent,
    parcel: rectangleParcel(SITE_WIDTH_M, SITE_DEPTH_M),
    heightmap: makeRampHeightmap({ width: SITE_WIDTH_M, height: SITE_DEPTH_M, gradeY: RAMP_GRADE }),
    parameters: parametersWith({ requiredFeatures: [] }),
    catalog: catalogIndex,
    baseline: BASELINE,
    zones: [],
    random: createSeededRandom(LAYOUT_SEED),
    ...patch,
  };
}
