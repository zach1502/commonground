import { HTTPException } from 'hono/http-exception';

import { MissingReferenceError } from '@parkshape/db';

import { ApiError, unauthenticated } from '../errors.js';

const HTTP_BAD_REQUEST = 400;
const HTTP_UNSUPPORTED_MEDIA_TYPE = 415;
const USER_REFERENCE = 'user ';

/**
 * Hono's validators throw an HTTPException for a body they cannot read: 400 for an empty or
 * broken JSON body and 415 for one sent as another type. Both are the caller's mistake.
 */
function requestFormatError(error: unknown): ApiError | undefined {
  if (!(error instanceof HTTPException)) return undefined;
  if (error.status === HTTP_BAD_REQUEST || error.status === HTTP_UNSUPPORTED_MEDIA_TYPE) {
    return new ApiError('validation', 'The request body must be JSON that matches the schema.');
  }
  return undefined;
}

/**
 * A well-signed cookie can outlive its user, for example after a local database reset. The
 * write that names the missing user then fails, and the caller is treated as signed out.
 */
function missingUserError(error: unknown): ApiError | undefined {
  const missingUser =
    error instanceof MissingReferenceError && error.reference.startsWith(USER_REFERENCE);
  return missingUser ? unauthenticated() : undefined;
}

/** Errors the caller caused that reach the error handler untyped, as their typed ApiError. */
export function clientError(error: unknown): ApiError | undefined {
  return requestFormatError(error) ?? missingUserError(error);
}
