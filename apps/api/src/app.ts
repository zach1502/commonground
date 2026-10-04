import { OpenAPIHono } from '@hono/zod-openapi';

import type { ApiApp, AppDeps, AppEnv } from './deps.js';
import { ApiError } from './errors.js';
import {
  bodyLimitMiddleware,
  corsMiddleware,
  errorResponse,
  requestIdMiddleware,
  sessionMiddleware,
} from './middleware/http.js';
import { jsonBodyMiddleware } from './middleware/json-body.js';
import { registerAiRoutes } from './routes/ai.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerBlobRoutes } from './routes/blobs.js';
import { registerDesignRoutes } from './routes/designs.js';
import { registerElementCommentRoutes } from './routes/element-comments.js';
import { registerInsightsRoutes } from './routes/insights.js';
import { registerParticipationRoutes } from './routes/participation.js';
import { registerProjectContextRoutes } from './routes/project-context.js';
import { registerProjectTerrainRoutes } from './routes/project-terrain.js';
import { registerProjectRoutes } from './routes/projects.js';
import { registerSiteRoutes } from './routes/site.js';
import { registerSystemRoutes } from './routes/system.js';

export { HEALTH_PATH } from './routes/system.js';

export const OPENAPI_INFO = {
  openapi: '3.1.0',
  info: {
    title: 'CommonGround API',
    version: '0.1.0',
    description: 'Design a park on real terrain, vote on designs, and see the results.',
  },
} as const;

/** Builds the HTTP app; runtime entries wrap it for Node, Vercel, and Lambda. */
export function createApp(deps: AppDeps): ApiApp {
  const app = new OpenAPIHono<AppEnv>({
    defaultHook: (result) => {
      if (!result.success) {
        const issues = result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        }));
        throw new ApiError('validation', 'The request is not valid.', { issues });
      }
    },
  });
  app.use('*', requestIdMiddleware(deps));
  app.use('*', corsMiddleware(deps));
  app.use('*', bodyLimitMiddleware());
  app.use('*', jsonBodyMiddleware());
  app.use('*', sessionMiddleware(deps));
  app.onError((error, c) => errorResponse(error, c, deps.logger));
  app.notFound((c) =>
    errorResponse(
      new ApiError('not-found', `No route for ${c.req.method} ${c.req.path}.`),
      c,
      deps.logger,
    ),
  );
  registerSystemRoutes(app, deps);
  registerAuthRoutes(app, deps);
  registerProjectRoutes(app, deps);
  registerProjectTerrainRoutes(app, deps);
  registerProjectContextRoutes(app, deps);
  registerSiteRoutes(app, deps);
  registerDesignRoutes(app, deps);
  registerParticipationRoutes(app, deps);
  registerElementCommentRoutes(app, deps);
  registerInsightsRoutes(app, deps);
  registerAiRoutes(app, deps);
  registerBlobRoutes(app, deps);
  return app;
}

/** The OpenAPI 3.1 document for every registered route. */
export function openApiDocument(app: ApiApp): ReturnType<ApiApp['getOpenAPI31Document']> {
  return app.getOpenAPI31Document(OPENAPI_INFO);
}
