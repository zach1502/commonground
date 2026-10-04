/** The 512 px maps tools/asset-pipeline writes to apps/web/public/textures. */
export type SurfaceMap =
  'grass-detail' | 'grass-normal' | 'asphalt-detail' | 'gravel-detail' | 'boardwalk-detail';

// Served from the web app's public folder, which the dev page and the seed page also serve.
const TEXTURE_BASE = '/textures/';

/** The ground's grain and its normal map, which every tier with detail maps draws. */
export const GROUND_MAPS: readonly SurfaceMap[] = ['grass-detail', 'grass-normal'];

export const surfaceMapUrl = (map: SurfaceMap): string => `${TEXTURE_BASE}${map}.jpg`;
