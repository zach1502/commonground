import { createRoute } from '@hono/zod-openapi';
import type { MiddlewareHandler } from 'hono';

import { intentBodySchema, intentResponseSchema, summaryResponseSchema } from '../contracts/ai.js';
import { errorResponses, idParamsSchema, jsonBody, jsonContent } from '../contracts/common.js';
import type { ApiApp, AppDeps, AppEnv } from '../deps.js';
import { featureOff } from '../errors.js';
import { HTTP_OK } from '../http-status.js';
import { requireSession, requireStaff } from '../middleware/http.js';
import { takeToken } from '../services/access.js';
import { describeIntent, projectSummary } from '../services/ai.js';

const summary = createRoute({
  method: 'get',
  path: '/projects/{id}/summary',
  operationId: 'getProjectSummary',
  tags: ['insights'],
  summary: 'Themes and tradeoffs across the top 10 live designs (staff only)',
  request: { params: idParamsSchema },
  responses: {
    [HTTP_OK]: jsonContent(summaryResponseSchema, 'The themes and tradeoffs.'),
    ...errorResponses('unauthenticated', 'forbidden', 'not-found', 'feature-off'),
  },
});

const intent = createRoute({
  method: 'post',
  path: '/projects/{id}/intent',
  operationId: 'describeIntent',
  tags: ['designs'],
  summary: 'Read a description of up to 400 characters into a park intent',
  request: { params: idParamsSchema, body: jsonBody(intentBodySchema) },
  responses: {
    [HTTP_OK]: jsonContent(intentResponseSchema, 'The features, paths, canopy and character.'),
    ...errorResponses(
      'invalid',
      'unauthenticated',
      'not-found',
      'feature-off',
      'too-large',
      'rate-limited',
    ),
  },
});

/** Runs before body validation, so a turned-off route answers 503 whatever it is sent. */
function requireFeature(isOn: () => boolean, feature: string): MiddlewareHandler<AppEnv> {
  return async (_c, next) => {
    if (!isOn()) {
      throw featureOff(feature);
    }
    await next();
  };
}

export function registerAiRoutes(app: ApiApp, deps: AppDeps): void {
  app.use(
    '/projects/:id/summary',
    requireFeature(() => deps.config.FEATURE_SUMMARY, 'The design summary'),
  );
  app.use(
    '/projects/:id/intent',
    requireFeature(() => deps.config.FEATURE_DESCRIBE_IT, 'Describe it'),
  );

  app.openapi(summary, async (c) => {
    requireStaff(c);
    return c.json(await projectSummary(deps, c.req.valid('param').id), HTTP_OK);
  });

  app.openapi(intent, async (c) => {
    const session = requireSession(c);
    await takeToken(deps.limits.intents, session.userId, 'descriptions');
    const { text } = c.req.valid('json');
    return c.json(await describeIntent(deps, c.req.valid('param').id, text), HTTP_OK);
  });
}
