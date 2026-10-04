import { describe, expect, it } from 'vitest';

import { localFrameFor } from '../../adapters/projection/local-frame.js';
import type { TerrainProvider, TerrainRequest } from '../terrain-provider.js';

// Cells may start up to this far inside the bounding box and still cover it, for float noise.
const EDGE_TOLERANCE_M = 1e-6;

function localBounds(request: TerrainRequest) {
  const points = localFrameFor(request.polygonWgs84).ringToLocal(request.polygonWgs84);
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

async function heightmapFor(provider: TerrainProvider, request: TerrainRequest) {
  const result = await provider.getHeightmap(request);
  if (!result.ok) throw new Error(`provider failed: ${JSON.stringify(result.error)}`);
  return result.value;
}

/**
 * Behaviour every TerrainProvider adapter must have. Each adapter test calls this with a
 * factory and a request the adapter can serve from its fixtures.
 */
export function terrainProviderContract(
  name: string,
  makeProvider: () => TerrainProvider | Promise<TerrainProvider>,
  request: TerrainRequest,
): void {
  describe(`${name} meets the TerrainProvider contract`, () => {
    it('returns a heightmap that covers the polygon bounds in the local frame', async () => {
      const { heightmap } = await heightmapFor(await makeProvider(), request);
      const bounds = localBounds(request);
      const { originLocal, width, height, resolutionM } = heightmap;
      expect(originLocal.x).toBeLessThanOrEqual(bounds.minX + EDGE_TOLERANCE_M);
      expect(originLocal.y).toBeLessThanOrEqual(bounds.minY + EDGE_TOLERANCE_M);
      expect(originLocal.x + width * resolutionM).toBeGreaterThanOrEqual(
        bounds.maxX - EDGE_TOLERANCE_M,
      );
      expect(originLocal.y + height * resolutionM).toBeGreaterThanOrEqual(
        bounds.maxY - EDGE_TOLERANCE_M,
      );
    });

    it('uses the requested resolution', async () => {
      const provider = await makeProvider();
      const fine = await heightmapFor(provider, request);
      const coarse = await heightmapFor(provider, {
        ...request,
        resolutionM: request.resolutionM * 2,
      });
      expect(fine.heightmap.resolutionM).toBe(request.resolutionM);
      expect(coarse.heightmap.resolutionM).toBe(request.resolutionM * 2);
      expect(coarse.heightmap.width).toBeLessThan(fine.heightmap.width);
    });

    it('fills every cell with a finite elevation', async () => {
      const { heightmap } = await heightmapFor(await makeProvider(), request);
      expect(heightmap.elevations).toHaveLength(heightmap.width * heightmap.height);
      expect([...heightmap.elevations].every(Number.isFinite)).toBe(true);
    });

    it('names its source, licence and CRS', async () => {
      const { source, crs } = await heightmapFor(await makeProvider(), request);
      expect(source.name).not.toBe('');
      expect(source.licence).not.toBe('');
      expect(source.url).toMatch(/^https?:\/\//);
      expect(crs).toMatch(/^EPSG:\d+$/);
    });

    it('rejects a resolution that is not positive', async () => {
      const result = await (await makeProvider()).getHeightmap({ ...request, resolutionM: 0 });
      expect(result.ok).toBe(false);
    });
  });
}
