import type { MiddlewareHandler } from 'hono';

import type { AppEnv } from '../deps.js';
import { ApiError } from '../errors.js';
import { isStorableText } from '../storable-text.js';

class UnstorableTextError extends Error {}

function refuseUnstorable(key: string, value: unknown): unknown {
  if (!isStorableText(key) || (typeof value === 'string' && !isStorableText(value))) {
    throw new UnstorableTextError();
  }
  return value;
}

/** Parses the text once with a reviver that sees every key and string, however deep. */
function checkJsonText(text: string): void {
  try {
    JSON.parse(text, refuseUnstorable);
  } catch (error) {
    if (error instanceof UnstorableTextError) {
      throw new ApiError(
        'validation',
        'Text in the request may not hold a null character or a lone surrogate.',
      );
    }
    throw new ApiError('validation', 'The request body is not valid JSON.');
  }
}

/**
 * Refuses a JSON body that does not parse, or whose text the database could not store, with a
 * 400 before any route reads it. Hono caches the text, so the route's validator reuses it.
 */
export function jsonBodyMiddleware(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const isJson = c.req.header('Content-Type')?.includes('json') === true;
    if (isJson && c.req.method !== 'GET' && c.req.method !== 'HEAD') {
      const text = await c.req.text();
      if (text !== '') checkJsonText(text);
    }
    await next();
  };
}
