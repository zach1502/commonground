import { createRoute, z } from '@hono/zod-openapi';

import { errorResponses, idParamsSchema, jsonContent } from '../contracts/common.js';
import { exportQuerySchema, insightsSchema } from '../contracts/insights.js';
import type { ApiApp, AppDeps } from '../deps.js';
import { HTTP_OK } from '../http-status.js';
import { requireStaff } from '../middleware/http.js';
import { exportChunks, projectInsights, type ExportFormat } from '../services/insights.js';

import { streamOf } from './streams.js';

const insights = createRoute({
  method: 'get',
  path: '/projects/{id}/insights',
  operationId: 'getInsights',
  tags: ['insights'],
  summary: 'What residents built and said: counts, heatmaps and breakdowns (staff only)',
  request: { params: idParamsSchema },
  responses: {
    [HTTP_OK]: jsonContent(insightsSchema, 'The insights, recomputed at most every 5 seconds.'),
    ...errorResponses('unauthenticated', 'forbidden', 'not-found'),
  },
});

const EXPORTS: readonly {
  readonly format: ExportFormat;
  readonly operationId: string;
  readonly contentType: string;
  readonly what: string;
}[] = [
  {
    format: 'csv',
    operationId: 'exportInsightsCsv',
    contentType: 'text/csv',
    what: 'one row per design',
  },
  {
    format: 'geojson',
    operationId: 'exportInsightsGeoJson',
    contentType: 'application/geo+json',
    what: 'one WGS84 feature per element',
  },
  {
    format: 'dxf',
    operationId: 'exportInsightsDxf',
    contentType: 'application/dxf',
    what: 'an R12 drawing in local metres',
  },
];

function exportRoute(entry: (typeof EXPORTS)[number]) {
  return createRoute({
    method: 'get',
    path: `/projects/{id}/insights/export.${entry.format}`,
    operationId: entry.operationId,
    tags: ['insights'],
    summary: `The top designs by leaderboard rank as ${entry.format.toUpperCase()}, ${entry.what} (staff only)`,
    request: { params: idParamsSchema, query: exportQuerySchema },
    responses: {
      [HTTP_OK]: {
        description: 'The file, sent as an attachment.',
        content: { [entry.contentType]: { schema: z.string() } },
      },
      ...errorResponses('invalid', 'unauthenticated', 'forbidden', 'not-found'),
    },
  });
}

export function registerInsightsRoutes(app: ApiApp, deps: AppDeps): void {
  app.openapi(insights, async (c) => {
    requireStaff(c);
    return c.json(await projectInsights(deps, c.req.valid('param').id), HTTP_OK);
  });

  EXPORTS.forEach((entry) => {
    app.openapi(exportRoute(entry), async (c) => {
      requireStaff(c);
      const projectId = c.req.valid('param').id;
      const count = c.req.valid('query').n;
      const chunks = await exportChunks(deps, { projectId, count, format: entry.format });
      const filename = `parkshape-${projectId}-top-${String(count)}.${entry.format}`;
      return c.body(streamOf(chunks), HTTP_OK, {
        'Content-Type': `${entry.contentType}; charset=utf-8`,
        'Content-Disposition': `attachment; filename="${filename}"`,
      });
    });
  });
}
