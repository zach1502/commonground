import { createRoute } from '@hono/zod-openapi';

import { errorResponses, idParamsSchema, jsonContent } from '../contracts/common.js';
import { siteContextResultSchema } from '../contracts/site.js';
import type { ApiApp, AppDeps } from '../deps.js';
import { HTTP_OK } from '../http-status.js';
import { loadProject } from '../services/access.js';
import { loadProjectContext } from '../services/site-context.js';

// The context is fixed once stored, so a browser can keep it while a resident moves between pages.
const CACHE_CONTROL = 'public, max-age=300';

const getContext = createRoute({
  method: 'get',
  path: '/projects/{id}/context',
  operationId: 'getProjectContext',
  tags: ['projects'],
  summary: 'The streets, sidewalks, bus stops, parking and bikeways around the parcel',
  request: { params: idParamsSchema },
  responses: {
    [HTTP_OK]: jsonContent(siteContextResultSchema, 'The context features.'),
    ...errorResponses('not-found', 'unavailable'),
  },
});

/** Context for the 3D views; anyone who can read the project can read it. */
export function registerProjectContextRoutes(app: ApiApp, deps: AppDeps): void {
  app.openapi(getContext, async (c) => {
    const project = await loadProject(deps.repos, c.req.valid('param').id);
    const context = await loadProjectContext(deps, project);
    c.header('Cache-Control', CACHE_CONTROL);
    return c.json(context, HTTP_OK);
  });
}
