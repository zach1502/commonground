// The baseline keeps one existing oak, locked, so the editor tests can try to move it.
export const LOCKED_OAK = { id: 'existing-oak', x: 40, y: 40 };

export const BASELINE = {
  version: 1,
  items: [
    {
      id: LOCKED_OAK.id,
      catalogId: 'garry-oak',
      position: { x: LOCKED_OAK.x, y: LOCKED_OAK.y },
      rotationDeg: 0,
      locked: true,
    },
  ],
  paths: [],
  areas: [],
  gradeDelta: { cells: [] },
  zones: [],
};

// 12 m by 16 m fits 24 raised beds, over the demo's hard garden minimum, as in the API fixtures.
const GARDEN_ORIGIN_M = 10;
const GARDEN_WIDTH_M = 12;
const GARDEN_DEPTH_M = 16;

/** The baseline plus a community garden, so it passes every hard rule and can be submitted. */
export const SUBMITTABLE = {
  ...BASELINE,
  areas: [
    {
      id: 'garden-1',
      catalogId: 'community-garden',
      polygon: [
        { x: GARDEN_ORIGIN_M, y: GARDEN_ORIGIN_M },
        { x: GARDEN_ORIGIN_M + GARDEN_WIDTH_M, y: GARDEN_ORIGIN_M },
        { x: GARDEN_ORIGIN_M + GARDEN_WIDTH_M, y: GARDEN_ORIGIN_M + GARDEN_DEPTH_M },
        { x: GARDEN_ORIGIN_M, y: GARDEN_ORIGIN_M + GARDEN_DEPTH_M },
      ],
      locked: false,
    },
  ],
};
