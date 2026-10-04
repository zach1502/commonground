import { ApiRequestError } from '@parkshape/api-client';

/**
 * "link" when the request never got an answer, as when the device is offline; "server" when the
 * API answered with an error status.
 */
export function failureKind(error: unknown): 'link' | 'server' {
  return error instanceof ApiRequestError ? 'server' : 'link';
}
