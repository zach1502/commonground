import { createRoute } from '@hono/zod-openapi';

import { errorResponses, jsonBody, jsonContent } from '../contracts/common.js';
import {
  siteFeaturesBodySchema,
  siteFeaturesResultSchema,
  terrainBodySchema,
  terrainResultSchema,
} from '../contracts/site.js';
import type { ApiApp, AppDeps } from '../deps.js';
import { HTTP_CREATED, HTTP_OK } from '../http-status.js';
import { requireStaff } from '../middleware/http.js';
import { loadSiteFeatures, loadTerrain } from '../services/site-data.js';

const loadTerrainRoute = createRoute({
  method: 'post',
  path: '/terrain',
  operationId: 'loadTerrain',
  tags: ['site'],
  summary: 'Fetch and store the elevation grid for an outline (staff only)',
  request: { body: jsonBody(terrainBodySchema) },
  responses: {
    [HTTP_CREATED]: jsonContent(terrainResultSchema, 'The stored heightmap and its source.'),
    ...errorResponses(
      'invalid',
      'unauthenticated',
      'forbidden',
      'site-data-unavailable',
      'upstream',
    ),
  },
});

const loadSiteFeaturesRoute = createRoute({
  method: 'post',
  path: '/site-features',
  operationId: 'loadSiteFeatures',
  tags: ['site'],
  summary: 'Find a park outline and its existing trees and structures (staff only)',
  request: { body: jsonBody(siteFeaturesBodySchema) },
  responses: {
    [HTTP_OK]: jsonContent(siteFeaturesResultSchema, 'The parcel and proposed features.'),
    ...errorResponses('invalid', 'unauthenticated', 'forbidden', 'not-found', 'upstream'),
  },
});

export function registerSiteRoutes(app: ApiApp, deps: AppDeps): void {
  app.openapi(loadTerrainRoute, async (c) => {
    requireStaff(c);
    return c.json(await loadTerrain(deps, c.req.valid('json')), HTTP_CREATED);
  });
  app.openapi(loadSiteFeaturesRoute, async (c) => {
    requireStaff(c);
    return c.json(await loadSiteFeatures(deps, c.req.valid('json')), HTTP_OK);
  });
}
