import { GRID_RESOLUTION_M, TRUCK_VOLUME_M3 } from '@parkshape/core';

/** Number of truck loads needed to move the given cut or fill depths, one depth per grid cell. */
export function truckLoadsForDepths(depthsM: readonly number[]): number {
  const cellAreaM2 = GRID_RESOLUTION_M * GRID_RESOLUTION_M;
  const volumeM3 = depthsM.reduce((total, depth) => total + Math.abs(depth) * cellAreaM2, 0);
  return Math.ceil(volumeM3 / TRUCK_VOLUME_M3);
}

export { geoJsonPolygonSchema } from './geojson.js';
export type { GeoJsonPolygon, LonLat } from './geojson.js';
export { localFrameFor, type LocalFrame } from './adapters/projection/local-frame.js';
export type { CacheStore, CachedBlob } from './ports/cache-store.js';
export type { HttpError, HttpFetch } from './ports/http.js';
export type {
  ProviderAttempt,
  TerrainError,
  TerrainProvider,
  TerrainRequest,
  TerrainResult,
  TerrainSource,
} from './ports/terrain-provider.js';
export type {
  FeatureAttributes,
  FeatureKind,
  FeatureProvenance,
  ProposedFeature,
  SiteFeatures,
  SiteFeaturesError,
  SiteFeaturesProvider,
  SiteFeaturesRequest,
  SiteParcel,
} from './ports/site-features-provider.js';
export type {
  SiteContextError,
  SiteContextProvider,
  SiteContextRequest,
} from './ports/site-context-provider.js';
export {
  InMemorySiteContextProvider,
  type InMemorySiteContextOptions,
} from './adapters/memory/in-memory-site-context-provider.js';
export {
  createSiteContextProvider,
  createSiteFeaturesProvider,
  createTerrainProvider,
  type ProviderDeps,
  type SiteContextProviderDeps,
  type SiteContextProviderName,
  type SiteFeaturesProviderName,
  type TerrainProviderName,
} from './select-providers.js';
export { parcelPolygonWgs84 } from './adapters/projection/context-box.js';
export { encodeHeightmap, type EncodeInput, type StoredHeightmap } from './heightmap-codec.js';
export {
  readStoredHeightmap,
  writeStoredHeightmap,
  type StoredHeightmapRead,
} from './stored-heightmap.js';
