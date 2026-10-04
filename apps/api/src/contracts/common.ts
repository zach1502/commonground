import { z } from '@hono/zod-openapi';

import { constraintKeySchema, severitySchema } from '@parkshape/core';

import { isStorableText } from '../storable-text.js';

export const isoDateSchema = z.iso.datetime().openapi({ example: '2026-09-25T12:00:00.000Z' });

export const errorBodySchema = z
  .object({
    error: z.object({
      kind: z.enum([
        'validation',
        'unauthenticated',
        'forbidden',
        'access-code-refused',
        'not-found',
        'phase-closed',
        'wrong-status',
        'liveCapReached',
        'projectExists',
        'hard-constraints',
        'rate-limited',
        'payload-too-large',
        'site-data-unavailable',
        'upstream-failed',
        'feature-off',
        'databaseUnavailable',
        'storageUnavailable',
        'metricsUnavailable',
        'contextUnavailable',
        'internal',
      ]),
      message: z.string(),
      requestId: z.string(),
      failures: z.array(z.object({ key: z.string(), detail: z.string() })).optional(),
      retryAfterSeconds: z.number().int().optional(),
      issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
    }),
  })
  .openapi('ErrorBody');

export const idParamsSchema = z.object({
  id: z
    .string()
    .min(1)
    .refine(isStorableText, 'An id may not hold a null character or a lone surrogate.')
    .openapi({ param: { name: 'id', in: 'path' }, example: 'design-1' }),
});

export const userSchema = z
  .object({
    id: z.string(),
    role: z.enum(['resident', 'staff']),
    displayName: z.string(),
  })
  .openapi('User');

export const authorSchema = z
  .object({ id: z.string(), displayName: z.string() })
  .nullable()
  .openapi('Author', { description: 'Null unless the caller wrote the design or voted on it.' });

const constraintResultSchema = z.object({
  status: z.enum(['ok', 'warn', 'fail']),
  severity: severitySchema,
  value: z.number(),
  limit: z.number().optional(),
  message: z.string(),
});

/** The core metrics report the server computed on submit, plus the terrain it used. */
export const metricsSchema = z
  .object({
    heightmapSource: z.enum(['stored', 'flat']),
    constraints: z.record(constraintKeySchema, constraintResultSchema),
    totals: z.object({
      costCad: z.number(),
      canopyPercent: z.number(),
      imperviousPercent: z.number(),
      waterPercent: z.number(),
      cut: z.number(),
      fill: z.number(),
      net: z.number(),
      truckTrips: z.number().int(),
      disturbedPercent: z.number(),
      gardenPlots: z.number().int(),
    }),
    isSubmittable: z.boolean(),
  })
  .openapi('DesignMetrics');

const errorContent = { 'application/json': { schema: errorBodySchema } };

const ERROR_RESPONSES = {
  invalid: { status: 400, description: 'The request did not match the schema.' },
  unauthenticated: { status: 401, description: 'No valid session cookie.' },
  forbidden: { status: 403, description: 'The caller may not do this.' },
  'access-code-refused': {
    status: 403,
    description: 'A staff persona was picked without the right access code.',
  },
  'not-found': { status: 404, description: 'Not found.' },
  conflict: {
    status: 409,
    description: 'The project is closed or the design is in the wrong state.',
  },
  'project-exists': {
    status: 409,
    description: 'The staff member already has a project with this name.',
  },
  unprocessable: {
    status: 422,
    description: 'The design breaks a hard constraint or the live limit.',
  },
  'rate-limited': { status: 429, description: 'Too many requests; retry later.' },
  'too-large': { status: 413, description: 'The request body is over the 1 MB limit.' },
  'feature-off': { status: 503, description: 'The feature flag for this route is off.' },
  unavailable: {
    status: 503,
    description:
      'The database, blob store, metrics workers or a context source did not answer; retry after Retry-After.',
  },
  'site-data-unavailable': {
    status: 422,
    description: 'No elevation or site data covers the requested area.',
  },
  upstream: { status: 502, description: 'A data source did not answer.' },
} as const;

export type ErrorResponseName = keyof typeof ERROR_RESPONSES;

/** The error responses a route can return, for the OpenAPI document. */
export function errorResponses(...names: readonly ErrorResponseName[]) {
  return Object.fromEntries(
    names.map((name) => {
      const { status, description } = ERROR_RESPONSES[name];
      return [status, { description, content: errorContent }];
    }),
  );
}

export function jsonContent<T>(schema: T, description: string) {
  return { description, content: { 'application/json': { schema } } };
}

export function jsonBody<T>(schema: T) {
  return { content: { 'application/json': { schema } }, required: true };
}
