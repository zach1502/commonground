import { err, ok, type Result } from '@parkshape/core';

import type { CacheStore } from '../../ports/cache-store.js';
import type { HttpFetch } from '../../ports/http.js';
import type {
  TerrainError,
  TerrainProvider,
  TerrainRequest,
  TerrainResult,
  TerrainSource,
} from '../../ports/terrain-provider.js';
import { bilinearAt, cellCentres, checkResolution, gridCovering } from '../../terrain-grid.js';
import { localFrameFor, reprojectorFor, type Reprojector } from '../projection/local-frame.js';

import { readCachedHeightmap, writeCachedHeightmap } from './heightmap-cache.js';
import { openCog, type CogWindow, type CrsBounds } from './remote-cog.js';
import { findDtmItem } from './stac.js';

export const CANELEVATION_STAC_URL = 'https://datacube.services.geo.ca/stac/api/search';
// Extra pixels read around the grid so bilinear samples at the edge have all four neighbours.
const WINDOW_MARGIN_PX = 2;
const HALF_PIXEL = 0.5;

export interface CogProviderOptions {
  readonly fetch: HttpFetch;
  readonly stacUrl?: string;
  readonly cache?: CacheStore;
}

interface CogCollection {
  readonly collection: string;
  readonly source: TerrainSource;
}

function resolveCrs(
  stacEpsg: number | undefined,
  cogEpsg: number | undefined,
): Result<Reprojector, TerrainError> {
  if (stacEpsg !== undefined && cogEpsg !== undefined && stacEpsg !== cogEpsg) {
    return err({ kind: 'crsMismatch', stacEpsg, cogEpsg });
  }
  const epsg = stacEpsg ?? cogEpsg;
  return epsg === undefined
    ? err({ kind: 'unsupportedCrs', crs: 'unknown' })
    : reprojectorFor(epsg);
}

function boundsAround(points: readonly (readonly [number, number])[], marginM: number): CrsBounds {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return {
    minX: Math.min(...xs) - marginM,
    minY: Math.min(...ys) - marginM,
    maxX: Math.max(...xs) + marginM,
    maxY: Math.max(...ys) + marginM,
  };
}

function sampleWindow(window: CogWindow, points: readonly (readonly [number, number])[]) {
  const elevations = new Float32Array(points.length);
  let missing = 0;
  points.forEach(([x, y], index) => {
    const col = (x - window.left) / window.pixelWidth - HALF_PIXEL;
    const row = (window.top - y) / window.pixelHeight - HALF_PIXEL;
    const value = bilinearAt(window, { col, row });
    if (value === undefined) missing += 1;
    elevations[index] = value ?? 0;
  });
  return { elevations, missing };
}

async function readFromCog(
  settings: CogCollection & CogProviderOptions,
  request: TerrainRequest,
): Promise<Result<TerrainResult, TerrainError>> {
  const item = await findDtmItem({
    fetch: settings.fetch,
    stacUrl: settings.stacUrl ?? CANELEVATION_STAC_URL,
    collection: settings.collection,
    polygonWgs84: request.polygonWgs84,
  });
  if (!item.ok) return item;
  const cog = await openCog(item.value.asset.href, settings.fetch);
  if (!cog.ok) return cog;
  const crs = resolveCrs(item.value.epsg, cog.value.epsg);
  if (!crs.ok) return crs;
  const frame = localFrameFor(request.polygonWgs84);
  const grid = gridCovering(frame.ringToLocal(request.polygonWgs84), request.resolutionM);
  const points = cellCentres(grid).map((centre) => crs.value.fromWgs84(frame.toWgs84(centre)));
  const margin = WINDOW_MARGIN_PX * cog.value.pixelSize;
  const window = await cog.value.readWindow(boundsAround(points, margin));
  const { elevations, missing } = sampleWindow(window, points);
  if (missing > 0) return err({ kind: 'noData', cells: missing });
  return ok({ heightmap: { ...grid, elevations }, source: settings.source, crs: crs.value.crs });
}

async function getCogHeightmap(
  settings: CogCollection & CogProviderOptions,
  request: TerrainRequest,
): Promise<Result<TerrainResult, TerrainError>> {
  const resolution = checkResolution(request);
  if (!resolution.ok) return resolution;
  const { cache } = settings;
  const key = { collection: settings.collection, ...request };
  const cached = cache === undefined ? undefined : await readCachedHeightmap(cache, key);
  if (cached !== undefined) return ok(cached);
  const result = await readFromCog(settings, request);
  if (result.ok && cache !== undefined) {
    const frameOrigin = localFrameFor(request.polygonWgs84).origin;
    await writeCachedHeightmap(cache, key, { result: result.value, frameOrigin });
  }
  return result;
}

const OGL_CANADA = 'Open Government Licence - Canada';

/** NRCan HRDEM mosaic, 1 m bare-earth DTM from lidar, read as a cloud-optimized GeoTIFF. */
export class HrdemCogProvider implements TerrainProvider {
  readonly name = 'hrdem';

  constructor(private readonly options: CogProviderOptions) {}

  getHeightmap(request: TerrainRequest): Promise<Result<TerrainResult, TerrainError>> {
    return getCogHeightmap(
      {
        ...this.options,
        collection: 'hrdem-mosaic-1m',
        source: {
          name: 'NRCan HRDEM',
          licence: OGL_CANADA,
          url: 'https://open.canada.ca/data/en/dataset/0fe65119-e96e-4a57-8bfe-9d9245fba06b',
        },
      },
      request,
    );
  }
}

/** NRCan MRDEM, 30 m DTM for all of Canada. Coarse, but covers places HRDEM does not. */
export class MrdemProvider implements TerrainProvider {
  readonly name = 'mrdem';

  constructor(private readonly options: CogProviderOptions) {}

  getHeightmap(request: TerrainRequest): Promise<Result<TerrainResult, TerrainError>> {
    return getCogHeightmap(
      {
        ...this.options,
        collection: 'mrdem-30',
        source: {
          name: 'NRCan MRDEM',
          licence: OGL_CANADA,
          url: 'https://open.canada.ca/data/en/dataset/18752265-bda3-498c-a4ba-9dfe68cb98da',
        },
      },
      request,
    );
  }
}
