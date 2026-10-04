import type { Context, MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';

import type { Logger } from '@parkshape/ai';
import type { Session } from '@parkshape/auth';

import type { AppDeps, AppEnv } from '../deps.js';
import { ApiError, forbidden, outageError, unauthenticated } from '../errors.js';

import { clientError } from './client-errors.js';

export const REQUEST_ID_HEADER = 'X-Request-Id';
// Accept a caller's id only when it is short and plain, so it is safe to echo and log.
const SAFE_REQUEST_ID = /^[\w-]{1,64}$/;
const HTTP_INTERNAL_ERROR = 500;
const BYTES_PER_KIB = 1024;
// Thumbnails are the largest body: 500 KB of image is about 683 KB once base64 encoded. The
// limit is 1 MiB; the refusal says "1 MB" because residents read MB, and the gap is under 5%.
export const MAX_BODY_BYTES = BYTES_PER_KIB * BYTES_PER_KIB;

/** Reuses a safe incoming X-Request-Id or makes one, and echoes it on the response. */
export function requestIdMiddleware(deps: AppDeps): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const incoming = c.req.header(REQUEST_ID_HEADER);
    const requestId =
      incoming !== undefined && SAFE_REQUEST_ID.test(incoming) ? incoming : deps.newRequestId();
    c.set('requestId', requestId);
    c.header(REQUEST_ID_HEADER, requestId);
    await next();
  };
}

/** Reads the session cookie once per request; routes decide whether one is required. */
export function sessionMiddleware(deps: AppDeps): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    c.set('session', await deps.auth.readSession(c.req.header('Cookie')));
    await next();
  };
}

/** Refuses a request body over MAX_BODY_BYTES before any route parses it; chunked bodies too. */
export function bodyLimitMiddleware(): MiddlewareHandler<AppEnv> {
  return bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: () => {
      throw new ApiError('payload-too-large', 'The request body is over the 1 MB limit.');
    },
  });
}

/**
 * The one CORS policy: the configured web origin, with cookies. Hono's cors sends
 * Allow-Credentials to every origin, so it is taken off unless the caller is the web origin.
 */
export function corsMiddleware(deps: AppDeps): MiddlewareHandler<AppEnv> {
  const policy = cors({
    origin: deps.config.CORS_ORIGIN,
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', REQUEST_ID_HEADER],
    exposeHeaders: [REQUEST_ID_HEADER, 'Retry-After'],
  });
  return async (c, next) => {
    const preflight = await policy(c, next);
    if (c.req.header('Origin') !== deps.config.CORS_ORIGIN) {
      // Hono copies c.res headers onto a returned preflight, so both lose the header.
      c.res.headers.delete('Access-Control-Allow-Credentials');
      preflight?.headers.delete('Access-Control-Allow-Credentials');
    }
    return preflight;
  };
}

export function requireSession(c: Context<AppEnv>): Session {
  const session = c.get('session');
  if (session === undefined) {
    throw unauthenticated();
  }
  return session;
}

export function requireStaff(c: Context<AppEnv>): Session {
  const session = requireSession(c);
  if (session.role !== 'staff') {
    throw forbidden('Only staff can do this.');
  }
  return session;
}

/** Maps typed errors to their status and one JSON shape; anything else is a 500. */
/** The first line of a message; drizzle puts the query parameters on the second. */
function firstLine(message: string): string {
  return message.split('\n', 1)[0] ?? '';
}

function describeError(error: unknown): string {
  if (!(error instanceof Error)) return typeof error;
  const code = (error as { code?: unknown }).code;
  const coded = typeof code === 'string' ? ` [${code}]` : '';
  return `${error.name}: ${firstLine(error.message)}${coded}`;
}

/**
 * One log line for a 500: the name, first message line and code of the error and its cause.
 * No stack and no query parameters, which can hold what a resident typed.
 */
export function failureLine(requestId: string, error: Error): string {
  const cause = error.cause === undefined ? '' : `; cause ${describeError(error.cause)}`;
  return `request ${requestId} failed: ${describeError(error)}${cause}`;
}

export function errorResponse(thrown: Error, c: Context<AppEnv>, logger: Logger): Response {
  const requestId = c.get('requestId');
  const error = outageError(thrown) ?? clientError(thrown) ?? thrown;
  if (error instanceof ApiError) {
    if (error.details.retryAfterSeconds !== undefined) {
      c.header('Retry-After', String(error.details.retryAfterSeconds));
    }
    return c.json(
      { error: { kind: error.kind, message: error.message, requestId, ...error.details } },
      error.status,
    );
  }
  logger.warn(failureLine(requestId, error));
  return c.json(
    { error: { kind: 'internal', message: 'Something went wrong on our side.', requestId } },
    HTTP_INTERNAL_ERROR,
  );
}
