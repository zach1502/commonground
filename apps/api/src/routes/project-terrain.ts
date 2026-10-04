import { createRoute } from '@hono/zod-openapi';

import { parcelSchema, type Heightmap } from '@parkshape/core';

import { errorResponses, idParamsSchema, jsonContent } from '../contracts/common.js';
import { projectTerrainSchema } from '../contracts/projects-designs.js';
import type { ApiApp, AppDeps } from '../deps.js';
import { HTTP_OK } from '../http-status.js';
import { loadProjectTerrain } from '../rules/index.js';
import { loadProject } from '../services/access.js';

// The grid is fixed for a project, so a browser can keep it while a resident moves between pages.
const CACHE_CONTROL = 'public, max-age=300';

const getTerrain = createRoute({
  method: 'get',
  path: '/projects/{id}/terrain',
  operationId: 'getProjectTerrain',
  tags: ['projects'],
  summary: 'The ground the 3D views draw: the stored heightmap, or a flat grid',
  request: { params: idParamsSchema },
  responses: {
    [HTTP_OK]: jsonContent(projectTerrainSchema, 'The heightmap.'),
    ...errorResponses('not-found', 'unavailable'),
  },
});

function base64Of(elevations: Float32Array): string {
  return Buffer.from(elevations.buffer, elevations.byteOffset, elevations.byteLength).toString(
    'base64',
  );
}

function presentTerrain(heightmap: Heightmap, source: 'stored' | 'flat') {
  const { width, height, resolutionM, originLocal } = heightmap;
  const elevations = Float32Array.from(heightmap.elevations);
  return { source, width, height, resolutionM, originLocal, elevations: base64Of(elevations) };
}

/** The same terrain the server measures a submission on, so the live views and metrics agree. */
export function registerProjectTerrainRoutes(app: ApiApp, deps: AppDeps): void {
  app.openapi(getTerrain, async (c) => {
    const project = await loadProject(deps.repos, c.req.valid('param').id);
    const parcel = parcelSchema.parse(project.parcel);
    const terrain = await loadProjectTerrain(deps.blobStore, project, parcel);
    c.header('Cache-Control', CACHE_CONTROL);
    return c.json(presentTerrain(terrain.heightmap, terrain.source), HTTP_OK);
  });
}
