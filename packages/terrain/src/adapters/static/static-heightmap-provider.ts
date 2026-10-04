import { err, ok, sampleAt, type Result } from '@parkshape/core';

import type { StoredHeightmap } from '../../heightmap-codec.js';
import { decodeHeightmap } from '../../heightmap-codec.js';
import type {
  TerrainError,
  TerrainProvider,
  TerrainRequest,
  TerrainResult,
} from '../../ports/terrain-provider.js';
import { cellCentres, checkResolution, gridCovering } from '../../terrain-grid.js';
import { localFrameFor } from '../projection/local-frame.js';

import {
  JONATHAN_ROGERS_FIXTURE_DIR,
  readHeightmapFixture,
  type FixtureDir,
  type HeightmapFixture,
} from './fixture-files.js';

const HALF = 0.5;

export type StaticHeightmapOptions =
  { readonly fixtureDir?: FixtureDir } | { readonly stored: StoredHeightmap };

function loadFixture(
  options: StaticHeightmapOptions,
): Promise<Result<HeightmapFixture, TerrainError>> {
  if ('stored' in options) {
    const decoded = decodeHeightmap(options.stored.header, options.stored.bytes);
    return Promise.resolve(
      decoded.ok ? ok({ header: options.stored.header, result: decoded.value }) : decoded,
    );
  }
  return readHeightmapFixture(options.fixtureDir ?? JONATHAN_ROGERS_FIXTURE_DIR);
}

function resample(
  fixture: HeightmapFixture,
  request: TerrainRequest,
): Result<TerrainResult, TerrainError> {
  const source = fixture.result.heightmap;
  const fixtureFrame = localFrameFor(fixture.header.polygonWgs84);
  const frame = localFrameFor(request.polygonWgs84);
  const grid = gridCovering(frame.ringToLocal(request.polygonWgs84), request.resolutionM);
  // Cell centres may sit up to half a fixture cell past the outer fixture centres.
  const slack = source.resolutionM * HALF;
  const maxX = source.originLocal.x + source.width * source.resolutionM + slack;
  const maxY = source.originLocal.y + source.height * source.resolutionM + slack;
  const points = cellCentres(grid).map((centre) => fixtureFrame.toLocal(frame.toWgs84(centre)));
  const outside = points.some(
    ({ x, y }) =>
      x < source.originLocal.x - slack || y < source.originLocal.y - slack || x > maxX || y > maxY,
  );
  if (outside) return err({ kind: 'outsideCoverage', source: fixture.header.source.name });
  const elevations = Float32Array.from(points, (point) => sampleAt(source, point));
  return ok({
    heightmap: { ...grid, elevations },
    source: fixture.result.source,
    crs: fixture.result.crs,
  });
}

/**
 * Serves a recorded heightmap from disk so the app runs offline. Requests are resampled from
 * the fixture grid, so any polygon inside the fixture and any resolution works.
 */
export class StaticHeightmapProvider implements TerrainProvider {
  readonly name = 'static';
  private fixture: Promise<Result<HeightmapFixture, TerrainError>> | undefined;

  constructor(private readonly options: StaticHeightmapOptions = {}) {}

  async getHeightmap(request: TerrainRequest): Promise<Result<TerrainResult, TerrainError>> {
    const resolution = checkResolution(request);
    if (!resolution.ok) return resolution;
    this.fixture ??= loadFixture(this.options);
    const fixture = await this.fixture;
    return fixture.ok ? resample(fixture.value, request) : fixture;
  }
}
