import { createRoute, z } from '@hono/zod-openapi';

import { errorResponses, jsonContent } from '../contracts/common.js';
import type { ApiApp, AppDeps } from '../deps.js';
import { databaseUnavailable } from '../errors.js';
import { HTTP_OK } from '../http-status.js';

export const HEALTH_PATH = '/health';
export const READY_PATH = '/ready';

const health = createRoute({
  method: 'get',
  path: HEALTH_PATH,
  operationId: 'getHealth',
  tags: ['health'],
  summary: 'Liveness check: the process is up, whatever the database is doing',
  responses: {
    [HTTP_OK]: jsonContent(z.object({ ok: z.literal(true) }).openapi('Health'), 'Alive.'),
  },
});

const ready = createRoute({
  method: 'get',
  path: READY_PATH,
  operationId: 'getReady',
  tags: ['health'],
  summary: 'Readiness check: 200 once the database answers, 503 while it does not',
  responses: {
    [HTTP_OK]: jsonContent(
      z.object({ ready: z.literal(true) }).openapi('Ready'),
      'The database answers.',
    ),
    ...errorResponses('unavailable'),
  },
});

export function registerSystemRoutes(app: ApiApp, deps: AppDeps): void {
  app.openapi(health, (c) => c.json({ ok: true } as const, HTTP_OK));
  app.openapi(ready, async (c) => {
    const readiness = await deps.readiness();
    if (readiness.kind !== 'ready') throw databaseUnavailable();
    return c.json({ ready: true } as const, HTTP_OK);
  });
}
